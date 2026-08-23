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
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
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
import { createDevLogger } from "../my-log/index";
import { loadToolDisplayConfig } from "./config";

const initializedApis = new WeakSet<ExtensionAPI>();
const registeredToolNames = new WeakMap<ExtensionAPI, Set<string>>();
const MAX_WRITE_DIFF_BYTES = 1_000_000;
const log = createDevLogger("my-tool-display");

type WritePreview =
  | { safe: true; previousContent: string }
  | { safe: false; reason: string };

type WriteDiffDetails =
  | { kind: "diff"; diff: string }
  | { kind: "summary"; summary: string };

type WriteDisplayDetails = {
  writeDiff: WriteDiffDetails;
  [key: string]: unknown;
};

type SafeWritePath =
  | { safe: true; path: string; existed: true; device: number; inode: number }
  | { safe: true; path: string; existed: false }
  | { safe: false; reason: string };

type ResolvedWritePath =
  | { resolved: true; path: string }
  | { resolved: false; reason: string };

type RealpathResult =
  | { resolved: true; path: string }
  | { resolved: false; error: unknown };

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

function describeError(error: unknown): string | undefined {
  const code = getErrorCode(error);
  if (error instanceof Error) {
    const message = error.message || error.name;
    return code ? `${code}: ${message}` : message;
  }
  if (typeof error === "string") {
    return error;
  }
  return code;
}

function withErrorDetails(reason: string, error: unknown): string {
  const details = describeError(error);
  return details ? `${reason} (${sanitizeToolOutput(details)})` : reason;
}

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

function sanitizeToolOutput(output: string): string {
  return Array.from(stripVTControlCharacters(output))
    .filter((character) => {
      const code = character.codePointAt(0);
      if (code === undefined) {
        return false;
      }
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        return true;
      }
      return code > 0x1f && (code < 0xfff9 || code > 0xfffb);
    })
    .join("")
    .replace(/\r/g, "");
}

function textOutput(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => sanitizeToolOutput(content.text ?? ""))
    .join("\n");
}

function isWithinWorkspace(workspacePath: string, targetPath: string): boolean {
  const relativePath = relative(workspacePath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function realpathOrUndefined(path: string): RealpathResult {
  try {
    return { resolved: true, path: realpathSync(path) };
  } catch (error) {
    return { resolved: false, error };
  }
}

function resolveWritePath(cwd: string, rawPath: string): ResolvedWritePath {
  let normalized = rawPath.replace(
    /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g,
    " ",
  );
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  try {
    if (normalized === "~") {
      normalized = homedir();
    } else if (normalized.startsWith("~/") || normalized.startsWith("~\\")) {
      normalized = `${homedir()}${normalized.slice(1)}`;
    } else if (normalized.startsWith("file://")) {
      normalized = fileURLToPath(normalized);
    }
    return {
      resolved: true,
      path: isAbsolute(normalized)
        ? resolve(normalized)
        : resolve(cwd, normalized),
    };
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
  if (!safePath.existed) {
    return { safe: true, previousContent: "" };
  }

  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      safePath.path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
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
    if (
      bytesRead > MAX_WRITE_DIFF_BYTES ||
      fstatSync(fileDescriptor).size > MAX_WRITE_DIFF_BYTES
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

    return {
      safe: true,
      previousContent: new TextDecoder("utf-8", { fatal: true }).decode(
        content,
      ),
    };
  } catch (error) {
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

function renderCompactTextResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  pendingLabel: string,
  failureLabel: string,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(theme.fg("error", output || failureLabel), 0, 0);
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", pendingLabel), 0, 0);
  }
  if (!options.expanded) {
    return new Text("", 0, 0);
  }
  return new Text(theme.fg("toolOutput", output), 0, 0);
}

function renderBashResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  collapsedLines: number,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(
      theme.fg(
        "error",
        output ? `Bash command failed.\n${output}` : "Bash command failed.",
      ),
      0,
      0,
    );
  }
  if (options.expanded) {
    return new Text(theme.fg("toolOutput", output), 0, 0);
  }
  if (!output) {
    return new Text(
      theme.fg("muted", options.isPartial ? "Running..." : "(no output)"),
      0,
      0,
    );
  }

  const lines = output.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  if (collapsedLines === 0) {
    return new Text(
      theme.fg(
        "muted",
        `Output hidden (${lines.length} lines; expand to view)`,
      ),
      0,
      0,
    );
  }

  const visible = lines.slice(0, collapsedLines);
  const remaining = lines.length - visible.length;
  let text = visible.join("\n");
  if (remaining > 0) {
    text += `\n${theme.fg("muted", `... (${remaining} more lines, expand to view)`)}`;
  }
  return new Text(theme.fg("toolOutput", text), 0, 0);
}

function formatEditCall(
  args: { path?: string; file_path?: string },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
): string {
  const path = args.file_path ?? args.path ?? "...";
  return `${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path)}`;
}

function renderEditDiff(
  diff: string,
  options: { expanded: boolean },
  theme: { fg(color: string, text: string): string },
  collapsedLines: number,
): Text {
  const lines = sanitizeToolOutput(diff).split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }

  const visible = options.expanded ? lines : lines.slice(0, collapsedLines);
  const remaining = lines.length - visible.length;
  const rendered: string[] = visible.map((line) => {
    const color = line.startsWith("+")
      ? "toolDiffAdded"
      : line.startsWith("-")
        ? "toolDiffRemoved"
        : "toolDiffContext";
    return theme.fg(color, line);
  });
  if (remaining > 0) {
    rendered.push(
      theme.fg("muted", `... (${remaining} more lines, expand to view)`),
    );
  }

  return new Text(rendered.join("\n"), 0, 0);
}

function renderEditResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: { diff?: unknown };
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  collapsedLines: number,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(theme.fg("error", output || "Edit failed."), 0, 0);
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Editing..."), 0, 0);
  }
  if (typeof result.details?.diff === "string" && result.details.diff) {
    return renderEditDiff(result.details.diff, options, theme, collapsedLines);
  }
  return new Text(
    theme.fg("muted", output || "Edit completed (diff unavailable)."),
    0,
    0,
  );
}

function renderWriteResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: WriteDisplayDetails;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  collapsedLines: number,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(theme.fg("error", output || "Write failed."), 0, 0);
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Writing..."), 0, 0);
  }
  const writeDiff = result.details?.writeDiff;
  if (writeDiff?.kind === "diff") {
    return renderEditDiff(writeDiff.diff, options, theme, collapsedLines);
  }
  return new Text(
    theme.fg(
      "warning",
      (writeDiff?.kind === "summary" && writeDiff.summary) ||
        output ||
        "Write completed (diff unavailable).",
    ),
    0,
    0,
  );
}

function formatWriteCall(
  args: { path?: string; file_path?: string },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
): string {
  const path = args.file_path ?? args.path ?? "...";
  return `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path)}`;
}

function formatReadCall(
  args: {
    path?: string;
    file_path?: string;
    offset?: number;
    limit?: number;
  },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
): string {
  const path = args.file_path ?? args.path ?? "...";
  const start = args.offset ?? 1;
  const range =
    args.offset === undefined && args.limit === undefined
      ? ""
      : args.limit === undefined
        ? `:${start}`
        : `:${start}-${start + args.limit - 1}`;
  return `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path)}${theme.fg("warning", range)}`;
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
    const writeOverride: typeof nativeWrite = {
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
              await writeFile(path, content, "utf8");
            },
          },
        }).execute(toolCallId, params, signal, onUpdate, ctx);

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
            details = {
              kind: "summary",
              summary: withErrorDetails(
                "Write diff unavailable because it could not be computed safely.",
                error,
              ),
            };
          }
        }

        const nativeDetails =
          result.details &&
          typeof result.details === "object" &&
          !Array.isArray(result.details)
            ? (result.details as Record<string, unknown>)
            : {};
        // Pi's native result type keeps details opaque; preserve that metadata
        // while adding the discriminated writeDiff payload owned by this renderer.
        return {
          ...result,
          details: { ...nativeDetails, writeDiff: details },
        } as unknown as typeof result;
      },
      renderCall(args, theme) {
        return new Text(formatWriteCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        return renderWriteResult(
          result as typeof result & { details?: WriteDisplayDetails },
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
        return createReadToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderCall(args, theme) {
        return new Text(formatReadCall(args, theme), 0, 0);
      },
      renderResult(result, options, theme, context) {
        const output = textOutput(result);
        if (context.isError) {
          return new Text(theme.fg("error", output || "Read failed."), 0, 0);
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
