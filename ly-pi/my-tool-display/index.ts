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
import { loadToolDisplayConfig } from "./config";

const initializedApis = new WeakSet<ExtensionAPI>();
const registeredApis = new WeakSet<ExtensionAPI>();
const MAX_WRITE_DIFF_BYTES = 1_000_000;

type WritePreview =
  | { safe: true; previousContent: string }
  | { safe: false; reason: string };

type WriteDiffDetails = {
  diff?: string;
  summary?: string;
};

type WriteDisplayDetails = {
  writeDiff: WriteDiffDetails;
  [key: string]: unknown;
};

function getBuiltinToolNames(pi: ExtensionAPI): Set<string> {
  try {
    return new Set(
      pi
        .getAllTools()
        .filter((tool) => tool.sourceInfo.source === "builtin")
        .map((tool) => tool.name),
    );
  } catch {
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

type SafeWritePath =
  | { path: string; existed: true; device: number; inode: number }
  | { path: string; existed: false }
  | { reason: string };

function realpathOrUndefined(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function resolveWritePath(
  cwd: string,
  rawPath: string,
): { path?: string; reason?: string } {
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
      path: isAbsolute(normalized)
        ? resolve(normalized)
        : resolve(cwd, normalized),
    };
  } catch {
    return {
      reason:
        "Write diff unavailable because the target path cannot be resolved safely.",
    };
  }
}

function resolveSafeWritePath(cwd: string, rawPath: string): SafeWritePath {
  if (!rawPath.trim()) {
    return {
      reason: "Write diff unavailable because the target path is empty.",
    };
  }

  const workspacePath = realpathOrUndefined(cwd);
  if (!workspacePath) {
    return {
      reason:
        "Write diff unavailable because the current workspace cannot be resolved safely.",
    };
  }

  const resolved = resolveWritePath(cwd, rawPath);
  if (resolved.reason || !resolved.path) {
    return { reason: resolved.reason ?? "Write diff unavailable." };
  }
  const resolvedPath = resolved.path;

  try {
    const targetStat = lstatSync(resolvedPath);
    const targetPath = realpathOrUndefined(resolvedPath);
    if (!targetPath) {
      return {
        reason:
          "Write diff unavailable because the target path cannot be resolved safely.",
      };
    }
    if (!isWithinWorkspace(workspacePath, targetPath)) {
      return {
        reason:
          "Write diff unavailable because the target path resolves outside the current workspace.",
      };
    }
    if (targetStat.isSymbolicLink()) {
      return {
        reason:
          "Write diff unavailable because the target path is a symbolic link.",
      };
    }
    if (!targetStat.isFile()) {
      return {
        reason:
          "Write diff unavailable because the target path is not a regular file.",
      };
    }
    return {
      path: resolvedPath,
      existed: true,
      device: targetStat.dev,
      inode: targetStat.ino,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        reason:
          "Write diff unavailable because the target path could not be resolved safely.",
      };
    }

    let parentPath = dirname(resolvedPath);
    while (parentPath !== dirname(parentPath) && !existsSync(parentPath)) {
      parentPath = dirname(parentPath);
    }
    const parentRealpath = realpathOrUndefined(parentPath);
    if (!parentRealpath) {
      return {
        reason:
          "Write diff unavailable because the target directory cannot be resolved safely.",
      };
    }
    if (!isWithinWorkspace(workspacePath, parentRealpath)) {
      return {
        reason:
          "Write diff unavailable because the target directory resolves outside the current workspace.",
      };
    }

    return { path: resolvedPath, existed: false };
  }
}

function readWritePreview(
  cwd: string,
  rawPath: string,
  nextContent: string,
): WritePreview {
  const safePath = resolveSafeWritePath(cwd, rawPath);
  if ("reason" in safePath) {
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
  } catch {
    return {
      safe: false,
      reason:
        "Write diff unavailable because the existing file could not be read safely.",
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
  const lines = diff.split(/\r?\n/);
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
  if (typeof writeDiff?.diff === "string" && writeDiff.diff) {
    return renderEditDiff(writeDiff.diff, options, theme, collapsedLines);
  }
  return new Text(
    theme.fg(
      "warning",
      writeDiff?.summary || output || "Write completed (diff unavailable).",
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

function registerToolRenderers(
  pi: ExtensionAPI,
  config: ReturnType<typeof loadToolDisplayConfig>,
): void {
  if (registeredApis.has(pi)) {
    return;
  }

  const builtinToolNames = getBuiltinToolNames(pi);
  if (builtinToolNames.size === 0) {
    return;
  }

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
            if (
              Buffer.byteLength(generated.diff, "utf8") > MAX_WRITE_DIFF_BYTES
            ) {
              details = {
                summary: `Write diff unavailable because the generated diff exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
              };
            } else {
              details = generated.diff
                ? { diff: generated.diff }
                : { summary: "Write completed; no text changes to display." };
            }
          } catch {
            details = {
              summary:
                "Write diff unavailable because it could not be computed safely.",
            };
          }
        }

        const nativeDetails =
          result.details &&
          typeof result.details === "object" &&
          !Array.isArray(result.details)
            ? (result.details as Record<string, unknown>)
            : {};
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

    pi.registerTool(writeOverride);
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

    pi.registerTool(editOverride);
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

    pi.registerTool(bashOverride);
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

    pi.registerTool(readOverride);
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

    pi.registerTool(grepOverride);
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

    pi.registerTool(findOverride);
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

    pi.registerTool(lsOverride);
  }

  registeredApis.add(pi);
}

export default function myToolDisplay(pi: ExtensionAPI): void {
  if (initializedApis.has(pi)) {
    return;
  }

  const config = loadToolDisplayConfig();
  if (!config.enabled) {
    return;
  }

  initializedApis.add(pi);
  pi.on("session_start", () => {
    registerToolRenderers(pi, config);
  });
}
