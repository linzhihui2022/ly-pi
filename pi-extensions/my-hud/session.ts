/**
 * Session-level token / cost aggregation and message helpers.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TokenUsage } from "./types";

const USD_TO_CNY = 7;

export function aggregateSessionUsage(entries: SessionEntry[]): TokenUsage {
  return entries
    .map((entry) => {
      if (entry.type === "message" && entry.message?.role === "assistant") {
        return {
          input: entry.message.usage.input,
          output: entry.message.usage.output,
          cacheRead: entry.message.usage.cacheRead,
          cacheWrite: entry.message.usage.cacheWrite,
          cost: entry.message.usage.cost.total * USD_TO_CNY,
        };
      }
      return null;
    })
    .reduce<TokenUsage>(
      (acc, session) => {
        if (session === null) return acc;
        return {
          input: acc.input + session.input,
          output: acc.output + session.output,
          cacheRead: acc.cacheRead + session.cacheRead,
          cacheWrite: acc.cacheWrite + session.cacheWrite,
          cost: acc.cost + session.cost,
        };
      },
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    );
}

export function aggregateJudgeStats(entries: SessionEntry[]): {
  allowed: number;
  denied: number;
} {
  let allowed = 0;
  let denied = 0;
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "my-permission-judge") {
      const decision = (entry.data as { decision?: string } | undefined)
        ?.decision;
      if (decision === "allowed") allowed++;
      else if (decision === "denied") denied++;
    }
  }
  return { allowed, denied };
}

/** Aggregate total cost from all judge LLM calls (USD stored, returned in CNY). */
export function aggregateJudgeCost(entries: SessionEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "my-permission-judge") {
      const cost = (entry.data as { cost?: number } | undefined)?.cost;
      if (typeof cost === "number") {
        total += cost;
      }
    }
  }
  return total * USD_TO_CNY;
}

/**
 * Strip skill XML blocks from a message, returning only the user's actual input.
 */
function stripSkillTags(text: string): string {
  // Matches <skill ...>...</skill> including newlines within the block
  return text.replace(/<skill[^>]*>[\s\S]*?<\/skill>/g, "").trim();
}

/**
 * Extract the text of the most recent user message from session entries.
 * Returns `null` if no user message is found.
 */
export function getLastUserMessage(entries: SessionEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message?.role !== "user") {
      continue;
    }

    const content = entry.message.content;
    if (content == null) continue;

    if (typeof content === "string") {
      const trimmed = stripSkillTags(content);
      if (trimmed) return trimmed;
      continue;
    }

    // Array of content parts (text / image / etc.)
    if (Array.isArray(content) && content.length > 0) {
      const text = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return part.text as string;
          }
          return "[MEDIA]";
        })
        .join(" ")
        .trim();
      const stripped = stripSkillTags(text);
      if (stripped) return stripped;
    }
  }

  return null;
}
