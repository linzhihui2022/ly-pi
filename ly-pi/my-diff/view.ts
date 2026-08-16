/**
 * View-model construction for /diff: list items, diff views, line classification.
 */

import type { ChangedFile, DiffLineKind, DiffView } from "./types";

/** Format a changed file as a selector list label: "M src/a.ts". */
export function formatListItem(file: ChangedFile): string {
  return `${file.status} ${file.path}`;
}

/**
 * Classify a diff line for theme coloring.
 * Header lines (---/+++/@@/diff --git) are context, never add/remove.
 */
export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---")) return "context";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  return "context";
}

const MAX_LINES = 500;

/** Build the render-ready diff view: title plus content lines.
 *  Guardrails: binary content and output over MAX_LINES collapse to a
 *  single placeholder line instead of rendering. */
export function buildDiffView(file: ChangedFile, raw: string): DiffView {
  const title = formatListItem(file);
  if (isBinary(raw)) {
    return { title, lines: ["Binary file, not shown"] };
  }
  const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  const lines = text === "" ? [] : text.split("\n");
  if (lines.length > MAX_LINES) {
    return {
      title,
      lines: [
        `Output too large (${lines.length} lines, limit ${MAX_LINES}), not shown`,
      ],
    };
  }
  return { title, lines };
}

/** Binary heuristic: NUL byte (untracked content) or git's binary diff marker. */
function isBinary(raw: string): boolean {
  return raw.includes("\0") || raw.startsWith("Binary files ");
}
