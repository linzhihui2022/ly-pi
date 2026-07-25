import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { JudgeResult } from "./types";

export const JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";

export interface JudgeLogEntry {
  decision: "allowed" | "denied";
  toolName: string;
  value: string;
  safe: boolean;
  score?: number;
  reason: string;
  toolFor: string;
}

interface JudgeLogInput {
  toolName: string;
  value: string;
}

export function recordJudgeStats(
  pi: ExtensionAPI,
  input: JudgeLogInput,
  result: JudgeResult,
): void {
  const entry: JudgeLogEntry = {
    decision: result.safe ? "allowed" : "denied",
    toolName: input.toolName,
    value: input.value,
    safe: result.safe,
    reason: result.reason,
    toolFor: result.toolFor,
  };
  if (result.score !== undefined) {
    entry.score = result.score;
  }
  pi.appendEntry(JUDGE_STATS_CUSTOM_TYPE, entry);
}

export function collectJudgeLogs(entries: SessionEntry[]): JudgeLogEntry[] {
  const logs: JudgeLogEntry[] = [];
  for (const entry of entries) {
    if (
      entry.type === "custom" &&
      entry.customType === JUDGE_STATS_CUSTOM_TYPE &&
      entry.data &&
      typeof entry.data === "object"
    ) {
      const data = entry.data as Partial<JudgeLogEntry>;
      if (
        typeof data.toolName === "string" &&
        typeof data.value === "string" &&
        typeof data.safe === "boolean" &&
        typeof data.reason === "string" &&
        typeof data.toolFor === "string"
      ) {
        logs.push({
          decision: data.safe ? "allowed" : "denied",
          toolName: data.toolName,
          value: data.value,
          safe: data.safe,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reason,
          toolFor: data.toolFor,
        });
      }
    }
  }
  return logs;
}
