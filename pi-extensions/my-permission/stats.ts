import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { JudgeResult, ToolInput } from "./types";

export const JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";
export const JUDGE_OVERRIDE_CUSTOM_TYPE = "my-permission-override";

export function recordUserOverride(pi: ExtensionAPI, input: ToolInput): void {
  pi.appendEntry(JUDGE_OVERRIDE_CUSTOM_TYPE, {
    toolName: input.toolName,
    value: input.value,
  });
}

interface ChatMessage {
  role: string;
  content: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: string; text?: string } =>
          typeof c === "object" && c !== null && "type" in c,
      )
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

export interface DeniedThenApproved {
  toolName: string;
  value: string;
  judgeReason: string;
  /** Up to 3 messages preceding the denied tool call. */
  context: ChatMessage[];
}

/** Finds tools the judge denied but the user later approved, with conversation context. */
export function collectDeniedThenApproved(
  entries: SessionEntry[],
): DeniedThenApproved[] {
  const deniedContext = new Map<string, ChatMessage[]>();
  const buffer: ChatMessage[] = [];

  for (const entry of entries) {
    if (
      entry.type === "message" &&
      entry.message &&
      (entry.message.role === "user" || entry.message.role === "assistant")
    ) {
      const text = extractText(entry.message.content);
      if (text.trim()) {
        buffer.push({ role: entry.message.role, content: text.trim() });
        if (buffer.length > 3) buffer.shift();
      }
    }

    if (
      entry.type === "custom" &&
      entry.customType === JUDGE_STATS_CUSTOM_TYPE
    ) {
      const data = entry.data as Partial<JudgeLogEntry>;
      if (
        typeof data.toolName === "string" &&
        typeof data.value === "string" &&
        data.safe === false &&
        typeof data.reason === "string"
      ) {
        deniedContext.set(`${data.toolName}:${data.value}`, [...buffer]);
      }
    }
  }

  const overrideKeys = new Set<string>();
  for (const entry of entries) {
    if (
      entry.type === "custom" &&
      entry.customType === JUDGE_OVERRIDE_CUSTOM_TYPE
    ) {
      const data = entry.data as { toolName?: string; value?: string };
      if (typeof data.toolName === "string" && typeof data.value === "string") {
        overrideKeys.add(`${data.toolName}:${data.value}`);
      }
    }
  }

  const result: DeniedThenApproved[] = [];
  for (const [key, context] of deniedContext) {
    if (overrideKeys.has(key)) {
      const colon = key.indexOf(":");
      result.push({
        toolName: key.slice(0, colon),
        value: key.slice(colon + 1),
        judgeReason: "", // filled below
        context,
      });
    }
  }

  // Second pass for judgeReason (need to find the judge entry again)
  for (const entry of entries) {
    if (
      entry.type === "custom" &&
      entry.customType === JUDGE_STATS_CUSTOM_TYPE
    ) {
      const data = entry.data as Partial<JudgeLogEntry>;
      if (
        typeof data.toolName === "string" &&
        typeof data.value === "string" &&
        data.safe === false &&
        typeof data.reason === "string"
      ) {
        const key = `${data.toolName}:${data.value}`;
        const item = result.find((r) => `${r.toolName}:${r.value}` === key);
        if (item) {
          item.judgeReason = data.reason;
        }
      }
    }
  }

  return result;
}

export interface JudgeLogEntry {
  decision: "allowed" | "denied";
  toolName: string;
  value: string;
  safe: boolean;
  score?: number;
  reason: string;
  toolFor: string;
  /** Present only when judge denied — whether the user later approved. */
  userApproved?: boolean;
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

/** Collects all judge entries where safe=true (allowed through without user intervention). */
export function collectAllowed(entries: SessionEntry[]): JudgeLogEntry[] {
  return collectJudgeLogs(entries).filter((log) => log.safe);
}

export function collectJudgeLogs(entries: SessionEntry[]): JudgeLogEntry[] {
  const overrideKeys = new Set<string>();
  for (const entry of entries) {
    if (
      entry.type === "custom" &&
      entry.customType === JUDGE_OVERRIDE_CUSTOM_TYPE
    ) {
      const data = entry.data as { toolName?: string; value?: string };
      if (typeof data.toolName === "string" && typeof data.value === "string") {
        overrideKeys.add(`${data.toolName}:${data.value}`);
      }
    }
  }

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
        const log: JudgeLogEntry = {
          decision: data.safe ? "allowed" : "denied",
          toolName: data.toolName,
          value: data.value,
          safe: data.safe,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reason,
          toolFor: data.toolFor,
        };
        if (!data.safe) {
          log.userApproved = overrideKeys.has(`${data.toolName}:${data.value}`);
        }
        logs.push(log);
      }
    }
  }
  return logs;
}
