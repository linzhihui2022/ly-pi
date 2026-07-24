import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { JudgeResult } from "./types";

export const JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";
const MAX_VALUE_LENGTH = 60;

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

export function formatJudgeLog(entries: SessionEntry[]): string {
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
          value: truncate(data.value, MAX_VALUE_LENGTH),
          safe: data.safe,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reason,
          toolFor: data.toolFor,
        });
      }
    }
  }

  if (logs.length === 0) {
    return "当前会话暂无法官判断";
  }

  const lines: string[] = [`当前会话法官判断（共 ${logs.length} 条）：`];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const label = log.safe ? "安全" : "不安全";
    const scoreText = log.score !== undefined ? `（${log.score}/10）` : "";
    lines.push(`${i + 1}. ${log.toolName}: ${log.value} → ${label}${scoreText}`);
    lines.push(`   用途：${log.toolFor}`);
    lines.push(`   理由：${log.reason}`);
  }

  return lines.join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}
