import { Text } from "@earendil-works/pi-tui";
import type {
  ToolDisplayConfig,
} from "./config";
import {
  extractTextOutput,
  splitLines,
  compactOutputLines,
  countNonEmptyLines,
  pluralize,
  previewLines,
  shortenPath,
} from "./render-utils";

// --- Theme interface ---

interface RenderTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

// --- Context interface ---

interface ToolRenderContextLike {
  args?: unknown;
  toolCallId?: string;
  cwd?: string;
  argsComplete?: boolean;
  isError?: boolean;
  isPartial?: boolean;
  expanded?: boolean;
}

// --- Helper: get string/number fields from args ---

function getStringField(value: unknown, field: string): string | undefined {
  const record = value as Record<string, unknown> | undefined;
  if (!record) return undefined;
  const raw = record[field];
  return typeof raw === "string" ? raw : undefined;
}

function getNumericField(value: unknown, field: string): number | undefined {
  const record = value as Record<string, unknown> | undefined;
  if (!record) return undefined;
  const raw = record[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

// --- Build preview text ---

function buildPreviewText(
  lines: string[],
  maxLines: number,
  theme: RenderTheme,
  expanded: boolean,
): string {
  if (lines.length === 0) {
    return theme.fg("muted", "↳ (no output)");
  }

  const { shown, remaining } = previewLines(lines, maxLines);
  let text = shown.join("\n");
  if (remaining > 0) {
    const hint = expanded ? "" : " • Ctrl+O to expand";
    text += `\n${theme.fg("muted", `... (${remaining} more ${pluralize(remaining, "line")}${hint})`)}`;
  }
  return text;
}

// --- Format read summary ---

function formatReadSummary(
  rawOutput: string,
  theme: RenderTheme,
): string {
  const summaryLines = compactOutputLines(splitLines(rawOutput), false);
  const lineCount = countNonEmptyLines(summaryLines);
  if (lineCount === 0) {
    return theme.fg("muted", "↳ (no output)");
  }
  return theme.fg("muted", `↳ loaded ${lineCount} ${pluralize(lineCount, "line")}`);
}

// --- Expanded preview cap ---

function getExpandedPreviewLineLimit(lines: string[]): number {
  const cap = 4000;
  return Math.min(lines.length, cap);
}

// --- Render read result ---

function renderReadResult(
  result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: RenderTheme,
  config: ToolDisplayConfig,
): Text {
  if (options.isPartial) {
    return new Text(theme.fg("warning", "reading..."), 0, 0);
  }

  if (config.readOutputMode === "hidden") {
    return new Text("", 0, 0);
  }

  const rawOutput = extractTextOutput(result);
  const lines = compactOutputLines(splitLines(rawOutput), options.expanded);

  if (config.readOutputMode === "summary") {
    if (options.expanded) {
      const maxLines = getExpandedPreviewLineLimit(lines);
      const preview = buildPreviewText(lines, maxLines, theme, true);
      return new Text(preview, 0, 0);
    }

    let summary = formatReadSummary(rawOutput, theme);
    summary += `\n${theme.fg("muted", "  • Ctrl+O to expand")}`;
    return new Text(summary, 0, 0);
  }

  // preview mode
  const maxLines = options.expanded
    ? getExpandedPreviewLineLimit(lines)
    : config.previewLines;
  const preview = buildPreviewText(lines, maxLines, theme, options.expanded);
  return new Text(preview, 0, 0);
}

// --- Render read call ---

function renderReadCall(
  args: unknown,
  theme: RenderTheme,
): Text {
  const path = shortenPath(getStringField(args, "file_path") ?? getStringField(args, "path"));
  const offset = getNumericField(args, "offset");
  const limit = getNumericField(args, "limit");

  let suffix = "";
  if (offset !== undefined || (limit !== undefined && limit > 0)) {
    const from = offset ?? 1;
    const to = limit !== undefined && limit > 0 ? from + limit - 1 : undefined;
    suffix = to ? `:${from}-${to}` : `:${from}`;
  }

  const line = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path || "...")}${theme.fg("warning", suffix)}`;
  return new Text(line, 0, 0);
}

// --- Factory: creates a read tool override definition ---

type ConfigGetter = () => ToolDisplayConfig;

export function createReadToolOverride(getConfig: ConfigGetter) {
  return {
    name: "read" as const,
    label: "read",
    description: "Read the contents of a file",
    renderCall: (args: unknown, theme: RenderTheme, _context?: ToolRenderContextLike) =>
      renderReadCall(args, theme),
    renderResult: (
      result: { content?: Array<{ type: string; text?: string }>; details?: unknown },
      options: { expanded: boolean; isPartial: boolean },
      theme: RenderTheme,
      _context?: ToolRenderContextLike,
    ) => renderReadResult(result, options, theme, getConfig()),
  };
}
