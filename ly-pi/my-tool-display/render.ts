import { Text } from "@earendil-works/pi-tui";
import {
  getWriteDiffDetails,
  hasVisibleOutput,
  sanitizeToolLabel,
  sanitizeToolOutput,
  textOutput,
} from "./sanitize";
import type { WriteDiffDetails } from "./types";

export function renderCompactTextResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  pendingLabel: string,
  failureLabel: string,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(
      theme.fg("error", hasVisibleOutput(output) ? output : failureLabel),
      0,
      0,
    );
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", pendingLabel), 0, 0);
  }
  if (!options.expanded) {
    return new Text("", 0, 0);
  }
  return new Text(theme.fg("toolOutput", output), 0, 0);
}

export function renderBashResult(
  result: { content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  collapsedLines: number,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    if (!hasVisibleOutput(output)) {
      return new Text(theme.fg("error", "Bash command failed."), 0, 0);
    }
    if (options.expanded) {
      return new Text(
        theme.fg("error", `Bash command failed.\n${output}`),
        0,
        0,
      );
    }

    const lines = output.split(/\r?\n/);
    while (lines.at(-1) === "") {
      lines.pop();
    }
    if (collapsedLines === 0) {
      return new Text(
        theme.fg(
          "error",
          `Bash command failed.\nOutput hidden (${lines.length} lines; expand to view)`,
        ),
        0,
        0,
      );
    }

    const visible = lines.slice(-collapsedLines);
    const hidden = lines.length - visible.length;
    let text = visible.join("\n");
    if (hidden > 0) {
      text = `${theme.fg("muted", `... (${hidden} earlier lines hidden, expand to view)`)}\n${text}`;
    }
    return new Text(theme.fg("error", `Bash command failed.\n${text}`), 0, 0);
  }
  if (!hasVisibleOutput(output)) {
    return new Text(
      theme.fg("muted", options.isPartial ? "Running..." : "(no output)"),
      0,
      0,
    );
  }
  if (options.expanded) {
    return new Text(theme.fg("toolOutput", output), 0, 0);
  }

  const lines = output.split(/\r?\n/);
  while (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines.length === 0) {
    return new Text(
      theme.fg("muted", options.isPartial ? "Running..." : "(no output)"),
      0,
      0,
    );
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

export function formatEditCall(
  args: { path?: string; file_path?: string },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
): string {
  const path = sanitizeToolLabel(args.file_path ?? args.path ?? "...");
  return `${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path)}`;
}

export function renderEditDiff(
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

export function renderEditResult(
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
    return new Text(
      theme.fg("error", hasVisibleOutput(output) ? output : "Edit failed."),
      0,
      0,
    );
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Editing..."), 0, 0);
  }
  if (typeof result.details?.diff === "string" && result.details.diff) {
    return renderEditDiff(result.details.diff, options, theme, collapsedLines);
  }
  return new Text(
    theme.fg("muted", "Edit completed (diff unavailable)."),
    0,
    0,
  );
}

export function renderWriteResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  writeDiff: WriteDiffDetails | undefined,
  options: { expanded: boolean; isPartial: boolean },
  theme: { fg(color: string, text: string): string },
  context: { isError: boolean },
  collapsedLines: number,
): Text {
  const output = textOutput(result);
  if (context.isError) {
    return new Text(
      theme.fg("error", hasVisibleOutput(output) ? output : "Write failed."),
      0,
      0,
    );
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", "Writing..."), 0, 0);
  }
  const displayWriteDiff = writeDiff ?? getWriteDiffDetails(result.details);
  if (displayWriteDiff?.kind === "diff") {
    return renderEditDiff(
      displayWriteDiff.diff,
      options,
      theme,
      collapsedLines,
    );
  }
  return new Text(
    theme.fg(
      "warning",
      (displayWriteDiff?.kind === "summary" && displayWriteDiff.summary) ||
        "Write completed (diff unavailable).",
    ),
    0,
    0,
  );
}

export function formatWriteCall(
  args: { path?: string; file_path?: string },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
): string {
  const path = sanitizeToolLabel(args.file_path ?? args.path ?? "...");
  return `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path)}`;
}

export function formatReadCall(
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
  const path = sanitizeToolLabel(args.file_path ?? args.path ?? "...");
  const start = args.offset ?? 1;
  const range =
    args.offset === undefined && args.limit === undefined
      ? ""
      : args.limit === undefined
        ? `:${start}`
        : `:${start}-${start + args.limit - 1}`;
  return `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", path)}${theme.fg("warning", range)}`;
}
