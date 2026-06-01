/**
 * Session-level token / cost aggregation.
 */

import type { SessionEntry, TokenUsage } from "./types";

const USD_TO_CNY = 7;

export function aggregateSessionUsage(entries: SessionEntry[]): TokenUsage {
  return entries
    .map((entry) => {
      if (
        entry.type === "message" &&
        entry.message?.role === "assistant"
      ) {
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
