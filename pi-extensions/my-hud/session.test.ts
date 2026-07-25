import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { aggregateJudgeStats, aggregateSessionUsage } from "./session";

describe("aggregateJudgeStats", () => {
  it("returns zeros for empty entries", () => {
    expect(aggregateJudgeStats([])).toEqual({ allowed: 0, denied: 0 });
  });

  it("counts allowed and denied decisions", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "allowed" },
      },
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "denied" },
      },
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "allowed" },
      },
      { type: "custom", customType: "other-extension", data: {} },
    ] as SessionEntry[];
    expect(aggregateJudgeStats(entries)).toEqual({ allowed: 2, denied: 1 });
  });

  it("ignores entries without customType", () => {
    const entries: SessionEntry[] = [
      { type: "message", message: { role: "user", content: "hi" } },
    ] as SessionEntry[];
    expect(aggregateJudgeStats(entries)).toEqual({ allowed: 0, denied: 0 });
  });

  it("ignores decisions with unknown values", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "allowed" },
      },
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "unknown" },
      },
      { type: "custom", customType: "my-permission-judge", data: {} },
    ] as SessionEntry[];
    expect(aggregateJudgeStats(entries)).toEqual({ allowed: 1, denied: 0 });
  });
});

describe("aggregateSessionUsage", () => {
  it("returns zeros for empty entries", () => {
    expect(aggregateSessionUsage([])).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
  });
});
