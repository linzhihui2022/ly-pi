import {
  createReadToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { loadToolDisplayConfig } from "./config";

const registeredApis = new WeakSet<ExtensionAPI>();

function isBuiltinReadAvailable(pi: ExtensionAPI): boolean {
  try {
    return pi
      .getAllTools()
      .some(
        (tool) => tool.name === "read" && tool.sourceInfo.source === "builtin",
      );
  } catch {
    return false;
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
  if (
    registeredApis.has(pi) ||
    !loadToolDisplayConfig().enabled ||
    !isBuiltinReadAvailable(pi)
  ) {
    return;
  }

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
  registeredApis.add(pi);
}
