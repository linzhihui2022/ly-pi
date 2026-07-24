import { describe, expect, it, vi } from "vitest";
import { JUDGE_STATS_CUSTOM_TYPE, recordJudgeStats } from "./stats";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function createMockCtx() {
  return {
    sessionManager: {
      appendEntry: vi.fn(),
    },
  } as unknown as ExtensionContext;
}

describe("recordJudgeStats", () => {
  it("records allowed decision", () => {
    const ctx = createMockCtx();
    recordJudgeStats(ctx, true);
    expect(ctx.sessionManager.appendEntry).toHaveBeenCalledWith(
      JUDGE_STATS_CUSTOM_TYPE,
      { decision: "allowed" },
    );
  });

  it("records denied decision", () => {
    const ctx = createMockCtx();
    recordJudgeStats(ctx, false);
    expect(ctx.sessionManager.appendEntry).toHaveBeenCalledWith(
      JUDGE_STATS_CUSTOM_TYPE,
      { decision: "denied" },
    );
  });
});
