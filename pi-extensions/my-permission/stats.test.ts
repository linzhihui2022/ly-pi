import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  collectJudgeLogs,
  JUDGE_STATS_CUSTOM_TYPE,
  type JudgeLogEntry,
  recordJudgeStats,
} from "./stats";

function createMockPi(): ExtensionAPI {
  return {
    appendEntry: vi.fn(),
  } as unknown as ExtensionAPI;
}

function createJudgeLogEntry(
  overrides: Partial<JudgeLogEntry> = {},
): SessionEntry {
  return {
    type: "custom",
    customType: JUDGE_STATS_CUSTOM_TYPE,
    data: {
      decision: "allowed",
      toolName: "bash",
      value: "git status",
      safe: true,
      score: 8,
      reason: "只读操作",
      toolFor: "查看 git 状态",
      ...overrides,
    },
  } as unknown as SessionEntry;
}

describe("recordJudgeStats", () => {
  it("records allowed decision", () => {
    const pi = createMockPi();
    recordJudgeStats(
      pi,
      { toolName: "bash", value: "git status" },
      { safe: true, score: 8, reason: "只读操作", toolFor: "查看 git 状态" },
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(JUDGE_STATS_CUSTOM_TYPE, {
      decision: "allowed",
      toolName: "bash",
      value: "git status",
      safe: true,
      score: 8,
      reason: "只读操作",
      toolFor: "查看 git 状态",
    });
  });

  it("records denied decision without score when judge fails", () => {
    const pi = createMockPi();
    recordJudgeStats(
      pi,
      { toolName: "bash", value: "rm -rf /" },
      { safe: false, reason: "危险命令", toolFor: "删除根目录" },
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(JUDGE_STATS_CUSTOM_TYPE, {
      decision: "denied",
      toolName: "bash",
      value: "rm -rf /",
      safe: false,
      reason: "危险命令",
      toolFor: "删除根目录",
    });
  });
});

describe("collectJudgeLogs", () => {
  it("returns empty array when no judge entries", () => {
    expect(collectJudgeLogs([])).toEqual([]);
  });

  it("ignores non-judge entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "other",
        data: {},
      } as unknown as SessionEntry,
      {
        type: "message",
        message: { role: "user", content: "hi" },
      } as unknown as SessionEntry,
    ];
    expect(collectJudgeLogs(entries)).toEqual([]);
  });

  it("ignores judge entries with invalid data", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: JUDGE_STATS_CUSTOM_TYPE,
        data: { decision: "allowed" },
      } as unknown as SessionEntry,
    ];
    expect(collectJudgeLogs(entries)).toEqual([]);
  });

  it("collects entries in chronological order without truncating values", () => {
    const longValue = "a".repeat(80);
    const logs = collectJudgeLogs([
      createJudgeLogEntry({ value: longValue }),
      createJudgeLogEntry({ toolName: "write", value: "b.txt", safe: false }),
    ]);
    expect(logs).toHaveLength(2);
    expect(logs[0].value).toBe(longValue);
    expect(logs[0].toolName).toBe("bash");
    expect(logs[1].toolName).toBe("write");
    expect(logs[1].safe).toBe(false);
  });

  it("omits score when not a number", () => {
    const logs = collectJudgeLogs([createJudgeLogEntry({ score: undefined })]);
    expect(logs[0].score).toBeUndefined();
  });
});
