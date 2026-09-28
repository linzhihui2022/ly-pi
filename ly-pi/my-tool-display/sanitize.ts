import { stripVTControlCharacters } from "node:util";
import type { WriteDiffDetails } from "./types";

export function canRoundTripUtf8(content: string): boolean {
  return Buffer.from(content, "utf8").toString("utf8") === content;
}

export function sanitizeToolOutput(output: string): string {
  return Array.from(stripVTControlCharacters(output))
    .filter((character) => {
      const code = character.codePointAt(0);
      if (code === undefined) {
        return false;
      }
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        return true;
      }
      if ((code >= 0x7f && code <= 0x9f) || /\p{Cf}/u.test(character)) {
        return false;
      }
      return code > 0x1f && (code < 0xfff9 || code > 0xfffb);
    })
    .join("")
    .replace(/\r/g, "");
}

export function sanitizeToolLabel(label: unknown): string {
  const text =
    typeof label === "string"
      ? label
      : label === null || label === undefined
        ? "..."
        : String(label);
  return sanitizeToolOutput(text).replace(/[\t\r\n\u2028\u2029]/g, " ");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeToolCallArgs<Arguments>(args: Arguments): Arguments {
  if (!isRecord(args)) {
    return args;
  }
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "string" ? sanitizeToolLabel(value) : value,
    ]),
  ) as Arguments;
}

export function getWriteDiffDetails(
  details: unknown,
): WriteDiffDetails | undefined {
  if (!isRecord(details)) {
    return undefined;
  }
  const writeDiff = (details as Record<string, unknown>).writeDiff;
  if (typeof writeDiff !== "object" || writeDiff === null) {
    return undefined;
  }
  const record = writeDiff as Record<string, unknown>;
  if (record.kind === "diff" && typeof record.diff === "string") {
    return { kind: "diff", diff: record.diff };
  }
  if (record.kind === "summary" && typeof record.summary === "string") {
    return { kind: "summary", summary: record.summary };
  }
  return undefined;
}

export function textOutput(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => sanitizeToolOutput(content.text ?? ""))
    .join("\n");
}

export function hasVisibleOutput(output: string): boolean {
  return output.trim().length > 0;
}
