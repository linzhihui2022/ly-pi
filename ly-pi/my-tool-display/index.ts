import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import {
  type AgentToolResult,
  type AgentToolUpdateCallback,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  generateDiffString,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { loadToolDisplayConfig } from "./config";
import {
  describeError,
  getErrorCode,
  logUnexpectedPreviewError,
  withErrorDetails,
} from "./errors";
import { log } from "./logger";
import { resolveToolPath } from "./path-utils";
import {
  formatEditCall,
  formatReadCall,
  formatWriteCall,
  renderBashResult,
  renderCompactTextResult,
  renderEditResult,
  renderWriteResult,
} from "./render";
import {
  canRoundTripUtf8,
  getWriteDiffDetails,
  hasVisibleOutput,
  isRecord,
  sanitizeToolCallArgs,
  textOutput,
} from "./sanitize";
import type {
  RealpathResult,
  ResolvedWritePath,
  SafeWritePath,
  WriteDiffDetails,
  WritePreview,
  WriteToolOverride,
  WriteToolResult,
} from "./types";

const initializedApis = new WeakSet<ExtensionAPI>();
const registeredToolNames = new WeakMap<ExtensionAPI, Set<string>>();
const writeDiffByContent = new WeakMap<object, WriteDiffDetails>();
const MAX_WRITE_DIFF_BYTES = 1_000_000;

function getBuiltinToolNames(pi: ExtensionAPI): Set<string> {
  try {
    return new Set(
      pi
        .getAllTools()
        .filter((tool) => tool.sourceInfo.source === "builtin")
        .map((tool) => tool.name),
    );
  } catch (error) {
    log.warn(
      "Unable to discover builtin tools; custom tool renderers are disabled.",
      { error: describeError(error) },
    );
    return new Set();
  }
}

function isWithinWorkspace(workspacePath: string, targetPath: string): boolean {
  const relativePath = relative(workspacePath, targetPath);
  const isParentPath =
    relativePath === ".." || relativePath.startsWith(`..${sep}`);
  return relativePath === "" || (!isParentPath && !isAbsolute(relativePath));
}

function realpathOrUndefined(path: string): RealpathResult {
  try {
    return { resolved: true, path: realpathSync(path) };
  } catch (error) {
    return { resolved: false, error };
  }
}

function resolveWritePath(cwd: string, rawPath: string): ResolvedWritePath {
  try {
    return { resolved: true, path: resolveToolPath(rawPath, cwd) };
  } catch (error) {
    return {
      resolved: false,
      reason: withErrorDetails(
        "Write diff unavailable because the target path cannot be resolved safely.",
        error,
      ),
    };
  }
}

function resolveSafeWritePath(cwd: string, rawPath: string): SafeWritePath {
  if (!rawPath.trim()) {
    return {
      safe: false,
      reason: "Write diff unavailable because the target path is empty.",
    };
  }

  const workspacePathResult = realpathOrUndefined(cwd);
  if (!workspacePathResult.resolved) {
    return {
      safe: false,
      reason: withErrorDetails(
        "Write diff unavailable because the current workspace cannot be resolved safely.",
        workspacePathResult.error,
      ),
    };
  }
  const workspacePath = workspacePathResult.path;

  const resolved = resolveWritePath(cwd, rawPath);
  if (!resolved.resolved) {
    return { safe: false, reason: resolved.reason };
  }
  const resolvedPath = resolved.path;

  try {
    const targetStat = lstatSync(resolvedPath);
    const targetPathResult = realpathOrUndefined(resolvedPath);
    if (!targetPathResult.resolved) {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target path cannot be resolved safely.",
          targetPathResult.error,
        ),
      };
    }
    const targetPath = targetPathResult.path;
    if (!isWithinWorkspace(workspacePath, targetPath)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path resolves outside the current workspace.",
      };
    }
    if (targetStat.isSymbolicLink()) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path is a symbolic link.",
      };
    }
    if (!targetStat.isFile()) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path is not a regular file.",
      };
    }
    return {
      safe: true,
      path: resolvedPath,
      existed: true,
      device: targetStat.dev,
      inode: targetStat.ino,
    };
  } catch (error) {
    if (getErrorCode(error) !== "ENOENT") {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target path could not be resolved safely.",
          error,
        ),
      };
    }

    let parentPath = dirname(resolvedPath);
    while (parentPath !== dirname(parentPath) && !existsSync(parentPath)) {
      parentPath = dirname(parentPath);
    }
    const parentPathResult = realpathOrUndefined(parentPath);
    if (!parentPathResult.resolved) {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target directory cannot be resolved safely.",
          parentPathResult.error,
        ),
      };
    }
    const parentRealpath = parentPathResult.path;
    if (!isWithinWorkspace(workspacePath, parentRealpath)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target directory resolves outside the current workspace.",
      };
    }

    return { safe: true, path: resolvedPath, existed: false };
  }
}

function readWritePreview(
  cwd: string,
  rawPath: string,
  nextContent: string,
): WritePreview {
  const safePath = resolveSafeWritePath(cwd, rawPath);
  if (!safePath.safe) {
    return { safe: false, reason: safePath.reason };
  }

  if (Buffer.byteLength(nextContent, "utf8") > MAX_WRITE_DIFF_BYTES) {
    return {
      safe: false,
      reason: `Write diff unavailable because the new content exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
    };
  }
  if (nextContent.includes("\0")) {
    return {
      safe: false,
      reason:
        "Write diff unavailable because the new content appears to be binary.",
    };
  }
  if (!canRoundTripUtf8(nextContent)) {
    return {
      safe: false,
      reason:
        "Write diff unavailable because the new content cannot be represented faithfully as UTF-8.",
    };
  }
  if (!safePath.existed) {
    return {
      safe: true,
      previousContent: "",
      snapshot: { path: safePath.path, existed: false },
    };
  }

  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      safePath.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const initialStats = fstatSync(fileDescriptor);
    if (
      !initialStats.isFile() ||
      initialStats.dev !== safePath.device ||
      initialStats.ino !== safePath.inode
    ) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the existing file could not be read safely.",
      };
    }
    if (initialStats.size > MAX_WRITE_DIFF_BYTES) {
      return {
        safe: false,
        reason: `Write diff unavailable because the existing file exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
      };
    }

    const bytes = Buffer.alloc(MAX_WRITE_DIFF_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const read = readSync(
        fileDescriptor,
        bytes,
        bytesRead,
        bytes.length - bytesRead,
        bytesRead,
      );
      if (read === 0) {
        break;
      }
      bytesRead += read;
    }
    const finalStats = fstatSync(fileDescriptor);
    if (
      bytesRead > MAX_WRITE_DIFF_BYTES ||
      finalStats.size > MAX_WRITE_DIFF_BYTES
    ) {
      return {
        safe: false,
        reason: `Write diff unavailable because the existing file exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
      };
    }

    const content = bytes.subarray(0, bytesRead);
    if (content.includes(0)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the existing file appears to be binary.",
      };
    }

    let previousContent: string;
    try {
      previousContent = new TextDecoder("utf-8", { fatal: true }).decode(
        content,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) {
        logUnexpectedPreviewError(
          "Unexpected error while decoding write diff preview.",
          error,
        );
      }
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the existing file contains invalid UTF-8 and could not be read safely.",
          error,
        ),
      };
    }

    return {
      safe: true,
      previousContent,
      snapshot: {
        path: safePath.path,
        existed: true,
        device: finalStats.dev,
        inode: finalStats.ino,
        size: finalStats.size,
        mtimeMs: finalStats.mtimeMs,
      },
    };
  } catch (error) {
    logUnexpectedPreviewError(
      "Unexpected error while reading write diff preview.",
      error,
    );
    return {
      safe: false,
      reason: withErrorDetails(
        "Write diff unavailable because the existing file could not be read safely.",
        error,
      ),
    };
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}

function isWritePreviewCurrent(
  preview: Extract<WritePreview, { safe: true }>,
): boolean {
  try {
    const stats = lstatSync(preview.snapshot.path);
    if (!preview.snapshot.existed) {
      return false;
    }
    return (
      stats.isFile() &&
      stats.dev === preview.snapshot.device &&
      stats.ino === preview.snapshot.inode &&
      stats.size === preview.snapshot.size &&
      stats.mtimeMs === preview.snapshot.mtimeMs
    );
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ENOENT" && !preview.snapshot.existed) {
      return true;
    }
    if (code !== "ENOENT") {
      logUnexpectedPreviewError(
        "Unexpected error while checking write diff preview freshness.",
        error,
      );
    }
    return false;
  }
}

function addWriteDiffDetails(
  result: AgentToolResult<unknown>,
  writeDiff: WriteDiffDetails,
): WriteToolResult {
  const nativeDetails = isRecord(result.details) ? result.details : {};
  return {
    ...result,
    details: { ...nativeDetails, writeDiff },
  };
}

function registerToolOverride(
  toolName: string,
  register: () => void,
  registeredNames: Set<string>,
): void {
  if (registeredNames.has(toolName)) {
    return;
  }
  try {
    register();
    registeredNames.add(toolName);
  } catch (error) {
    log.error(`Unable to register ${toolName} renderer.`, {
      error: describeError(error),
      tool: toolName,
    });
  }
}

function registerToolRenderers(
  pi: ExtensionAPI,
  config: ReturnType<typeof loadToolDisplayConfig>,
): void {
  const builtinToolNames = getBuiltinToolNames(pi);
  if (builtinToolNames.size === 0) {
    return;
  }
  const registeredNames = registeredToolNames.get(pi) ?? new Set<string>();
  registeredToolNames.set(pi, registeredNames);

  if (builtinToolNames.has("write")) {
    const nativeWrite = createWriteToolDefinition(process.cwd());
    const writeOverride: WriteToolOverride = {
      ...nativeWrite,
      renderShell: "default",
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        let preview: WritePreview | undefined;
        const result = await createWriteToolDefinition(ctx.cwd, {
          operations: {
            async mkdir(path) {
              await mkdir(path, { recursive: true });
            },
            async writeFile(path, content) {
              preview = readWritePreview(ctx.cwd, path, content);
              if (preview.safe && !isWritePreviewCurrent(preview)) {
                preview = {
                  safe: false,
                  reason:
                    "Write diff unavailable because the target changed while preparing the write.",
                };
              }
              await writeFile(path, content, "utf8");
            },
          },
        }).execute(
          toolCallId,
          params,
          signal,
          onUpdate as AgentToolUpdateCallback<undefined> | undefined,
          ctx,
        );

        let details: WriteDiffDetails;
        if (!preview?.safe) {
          details = {
            kind: "summary",
            summary:
              preview?.reason ??
              "Write diff unavailable because the previous content could not be captured safely.",
          };
        } else {
          try {
            const generated = generateDiffString(
              preview.previousContent,
              params.content,
            );
            if (!generated || typeof generated.diff !== "string") {
              details = {
                kind: "summary",
                summary:
                  "Write diff unavailable because it could not be computed safely.",
              };
            } else if (
              Buffer.byteLength(generated.diff, "utf8") > MAX_WRITE_DIFF_BYTES
            ) {
              details = {
                kind: "summary",
                summary: `Write diff unavailable because the generated diff exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
              };
            } else {
              details = generated.diff
                ? { kind: "diff", diff: generated.diff }
                : {
                    kind: "summary",
                    summary: "Write completed; no text changes to display.",
                  };
            }
          } catch (error) {
            logUnexpectedPreviewError(
              "Unexpected error while computing write diff.",
              error,
            );
            details = {
              kind: "summary",
              summary: withErrorDetails(
                "Write diff unavailable because it could not be computed safely.",
                error,
              ),
            };
          }
        }

        const resultWithDetails = addWriteDiffDetails(result, details);
        writeDiffByContent.set(resultWithDetails.content, details);
        return resultWithDetails;
      },
      renderCall(args, theme) {
        return new Text(formatWriteCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        return renderWriteResult(
          result,
          writeDiffByContent.get(result.content) ??
            getWriteDiffDetails(result.details),
          options,
          theme,
          context,
          config.diffCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "write",
      () => pi.registerTool(writeOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("edit")) {
    const nativeEdit = createEditToolDefinition(process.cwd());
    const editOverride: typeof nativeEdit = {
      ...nativeEdit,
      renderShell: "default",
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createEditToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderCall(args, theme) {
        return new Text(formatEditCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        return renderEditResult(
          result,
          options,
          theme,
          context,
          config.diffCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "edit",
      () => pi.registerTool(editOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("bash")) {
    const nativeBash = createBashToolDefinition(process.cwd());
    const bashOverride: typeof nativeBash = {
      ...nativeBash,
      renderCall(args, theme, context) {
        if (!nativeBash.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeBash.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
          projectTrusted: ctx.isProjectTrusted(),
        });
        return createBashToolDefinition(ctx.cwd, {
          commandPrefix: settings.getShellCommandPrefix(),
          shellPath: settings.getShellPath(),
        }).execute(toolCallId, params, signal, onUpdate, ctx);
      },
      renderResult(result, options, theme, context) {
        return renderBashResult(
          result,
          options,
          theme,
          context,
          config.bashCollapsedLines,
        );
      },
    };

    registerToolOverride(
      "bash",
      () => pi.registerTool(bashOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("read")) {
    const nativeRead = createReadToolDefinition(process.cwd());
    const readOverride: typeof nativeRead = {
      ...nativeRead,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
          projectTrusted: ctx.isProjectTrusted(),
        });
        return createReadToolDefinition(ctx.cwd, {
          autoResizeImages: settings.getImageAutoResize(),
        }).execute(toolCallId, params, signal, onUpdate, ctx);
      },
      renderCall(args, theme) {
        return new Text(formatReadCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        const output = textOutput(result);
        if (context.isError) {
          return new Text(
            theme.fg(
              "error",
              hasVisibleOutput(output) ? output : "Read failed.",
            ),
            0,
            0,
          );
        }
        if (options.isPartial) {
          return new Text(theme.fg("warning", "Reading..."), 0, 0);
        }
        if (!options.expanded) {
          return new Text("", 0, 0);
        }
        if (
          result.content.some((content) => content.type === "image") &&
          nativeRead.renderResult
        ) {
          return nativeRead.renderResult(result, options, theme, context);
        }
        return new Text(theme.fg("toolOutput", output), 0, 0);
      },
    };

    registerToolOverride(
      "read",
      () => pi.registerTool(readOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("grep")) {
    const nativeGrep = createGrepToolDefinition(process.cwd());
    const grepOverride: typeof nativeGrep = {
      ...nativeGrep,
      renderCall(args, theme, context) {
        if (!nativeGrep.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeGrep.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createGrepToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Searching...",
          "Search failed.",
        );
      },
    };

    registerToolOverride(
      "grep",
      () => pi.registerTool(grepOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("find")) {
    const nativeFind = createFindToolDefinition(process.cwd());
    const findOverride: typeof nativeFind = {
      ...nativeFind,
      renderCall(args, theme, context) {
        if (!nativeFind.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeFind.renderCall(
          sanitizeToolCallArgs(args),
          theme,
          context,
        );
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createFindToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Finding files...",
          "Find failed.",
        );
      },
    };

    registerToolOverride(
      "find",
      () => pi.registerTool(findOverride),
      registeredNames,
    );
  }

  if (builtinToolNames.has("ls")) {
    const nativeLs = createLsToolDefinition(process.cwd());
    const lsOverride: typeof nativeLs = {
      ...nativeLs,
      renderCall(args, theme, context) {
        if (!nativeLs.renderCall) {
          return new Text("", 0, 0);
        }
        return nativeLs.renderCall(sanitizeToolCallArgs(args), theme, context);
      },
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createLsToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderResult(result, options, theme, context) {
        return renderCompactTextResult(
          result,
          options,
          theme,
          context,
          "Listing files...",
          "List failed.",
        );
      },
    };

    registerToolOverride(
      "ls",
      () => pi.registerTool(lsOverride),
      registeredNames,
    );
  }
}

export default function myToolDisplay(pi: ExtensionAPI): void {
  if (initializedApis.has(pi)) {
    return;
  }

  initializedApis.add(pi);
  pi.on("session_start", () => {
    const config = loadToolDisplayConfig();
    if (!config.enabled) {
      return;
    }
    registerToolRenderers(pi, config);
  });
}
