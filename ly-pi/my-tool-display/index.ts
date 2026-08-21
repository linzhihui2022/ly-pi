import {
  createBashToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { loadToolDisplayConfig } from "./config";

const registeredApis = new WeakSet<ExtensionAPI>();

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

function textOutput(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n");
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

export default function myToolDisplay(pi: ExtensionAPI): void {
  if (registeredApis.has(pi)) {
    return;
  }

  const config = loadToolDisplayConfig();
  if (!config.enabled) {
    return;
  }

  const builtinToolNames = getBuiltinToolNames(pi);
  if (builtinToolNames.size === 0) {
    return;
  }

  if (builtinToolNames.has("bash")) {
    const nativeBash = createBashToolDefinition(process.cwd());
    const bashOverride: typeof nativeBash = {
      ...nativeBash,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return createBashToolDefinition(ctx.cwd).execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
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
