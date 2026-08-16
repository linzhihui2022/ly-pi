/**
 * Pure formatting helpers for my-compact single-line tool rendering.
 */

export interface ToolResultLike {
  content?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  details?: Record<string, unknown>;
}

/** Replace the home directory prefix with ~. */
export function shortenPath(path: string, home: string): string {
  if (!path) return path;
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

/** Collapse a multi-line shell command into a single line. */
export function flattenCommand(command: string): string {
  return command
    .split("\n")
    .map((line) => line.trim().replace(/\\+$/, "").trim())
    .filter(Boolean)
    .join(" ; ");
}

/** Truncate text to max characters, appending an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** First line of a text block. */
export function firstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? text : text.slice(0, idx);
}

/** Extract the first text content of a tool result. */
export function extractText(result: ToolResultLike): string | undefined {
  const item = result.content?.find((c) => c.type === "text");
  return item?.text;
}

/** Whether the result carries an image content block. */
export function hasImage(result: ToolResultLike): boolean {
  return result.content?.some((c) => c.type === "image") ?? false;
}

/** Parse the trailing "exit code: N" marker from bash output. */
export function extractExitCode(output: string): number | null {
  const match = output.match(/exit code: (\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Number of lines in a text block. */
export function countLines(text: string): number {
  return text.split("\n").length;
}

const MAX_COMMAND_LENGTH = 120;
const MAX_GENERIC_ARG_LENGTH = 80;

/** Format the single-line renderCall summary for a non-built-in tool. */
export function formatGenericCallText(
  tool: string,
  args: Record<string, unknown>,
): string {
  const values = Object.values(args ?? {});
  const firstString = values.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  if (typeof firstString === "string") {
    const collapsed = firstString.replace(/\s+/g, " ").trim();
    return `${tool} ${truncate(collapsed, MAX_GENERIC_ARG_LENGTH)}`;
  }
  if (values.length > 0) return `${tool} (${values.length} args)`;
  return tool;
}

/** Format the single-line renderCall summary for a built-in tool. */
export function formatCallText(
  tool: string,
  args: Record<string, unknown>,
  home: string,
): string {
  const path = typeof args.path === "string" ? args.path : "";

  switch (tool) {
    case "read": {
      let text = `read ${path ? shortenPath(path, home) : "..."}`;
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? String(start + limit - 1) : "";
        text += `:${start}${end ? `-${end}` : "-"}`;
      }
      return text;
    }
    case "bash": {
      const command = typeof args.command === "string" ? args.command : "...";
      return `$ ${truncate(flattenCommand(command), MAX_COMMAND_LENGTH)}`;
    }
    case "edit":
      return `edit ${path ? shortenPath(path, home) : "..."}`;
    case "write": {
      const content = typeof args.content === "string" ? args.content : "";
      const lines = content ? ` (${countLines(content)} lines)` : "";
      return `write ${path ? shortenPath(path, home) : "..."}${lines}`;
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      const glob = typeof args.glob === "string" ? ` (${args.glob})` : "";
      return `grep /${pattern}/ in ${shortenPath(path || ".", home)}${glob}`;
    }
    case "find": {
      const pattern = typeof args.pattern === "string" ? args.pattern : "";
      return `find ${pattern} in ${shortenPath(path || ".", home)}`;
    }
    case "ls":
      return `ls ${shortenPath(path || ".", home)}`;
    default:
      return tool;
  }
}
