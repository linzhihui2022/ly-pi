import { homedir } from "node:os";

interface TextLikeBlock {
  type: string;
  text?: string;
}

interface ToolResultLike {
  content?: unknown;
}

/**
 * Extract plain text output from a tool result's content blocks.
 */
export function extractTextOutput(result: ToolResultLike): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const textBlocks = blocks.filter(
    (block): block is TextLikeBlock =>
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      (block as TextLikeBlock).type === "text" &&
      typeof (block as TextLikeBlock).text === "string",
  );
  return textBlocks.map((b) => b.text ?? "").join("\n");
}

/**
 * Split text into lines, normalizing tabs to 4 spaces and stripping \r.
 */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\t/g, "    "));
}

/**
 * Collapse trailing empty lines and consecutive empty lines when not expanded.
 */
export function compactOutputLines(
  lines: string[],
  expanded: boolean,
): string[] {
  // Trim trailing empty lines
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim().length === 0) {
    trimmed.pop();
  }

  if (expanded) return trimmed;

  // Collapse consecutive empty lines to 1
  const compacted: string[] = [];
  let consecutiveEmpty = 0;
  for (const line of trimmed) {
    if (line.trim().length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 1) continue;
    } else {
      consecutiveEmpty = 0;
    }
    compacted.push(line);
  }
  return compacted;
}

/**
 * Count non-empty lines.
 */
export function countNonEmptyLines(lines: string[]): number {
  return lines.filter((line) => line.trim().length > 0).length;
}

/**
 * Pluralize a word based on count.
 */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

/**
 * Return the first `maxLines` lines and the remaining count.
 */
export function previewLines(
  lines: string[],
  maxLines: number,
): { shown: string[]; remaining: number } {
  const limit = Math.max(0, maxLines);
  const shown = lines.slice(0, limit);
  const remaining = Math.max(0, lines.length - shown.length);
  return { shown, remaining };
}

/**
 * Shorten a file path by replacing home directory with ~.
 */
export function shortenPath(inputPath: string | undefined): string {
  if (!inputPath) return "";
  const home = homedir();
  return inputPath.startsWith(home) ? `~${inputPath.slice(home.length)}` : inputPath;
}
