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

/** Build the render-ready diff view: title plus content lines. */
export function buildDiffView(file: ChangedFile, raw: string): DiffView {
  const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  return {
    title: formatListItem(file),
    lines: text === "" ? [] : text.split("\n"),
  };
}
