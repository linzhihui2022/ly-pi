import { describe, expect, it, vi } from "vitest";
import {
  JUDGE_STATS_CUSTOM_TYPE,
  formatJudgeLog,
  recordJudgeStats,
  type JudgeLogEntry,
} from "./stats";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

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
    expect(pi.appendEntry).toHaveBeenCalledWith(
      JUDGE_STATS_CUSTOM_TYPE,
      {
        decision: "allowed",
        toolName: "bash",
        value: "git status",
        safe: true,
        score: 8,
        reason: "只读操作",
        toolFor: "查看 git 状态",
      },
    );
  });

  it("records denied decision without score when judge fails", () => {
    const pi = createMockPi();
    recordJudgeStats(
      pi,
      { toolName: "bash", value: "rm -rf /" },
      { safe: false, reason: "危险命令", toolFor: "删除根目录" },
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(
      JUDGE_STATS_CUSTOM_TYPE,
      {
        decision: "denied",
        toolName: "bash",
        value: "rm -rf /",
        safe: false,
        reason: "危险命令",
        toolFor: "删除根目录",
      },
    );
  });
});

describe("formatJudgeLog", () => {
  it("returns empty message when no judge entries", () => {
    const text = formatJudgeLog([]);
    expect(text).toBe("当前会话暂无法官判断");
  });

  it("ignores non-judge entries", () => {
    const entries: SessionEntry[] = [
      { type: "custom", customType: "other", data: {} } as unknown as SessionEntry,
      { type: "message", message: { role: "user", content: "hi" } } as unknown as SessionEntry,
    ];
    expect(formatJudgeLog(entries)).toBe("当前会话暂无法官判断");
  });

  it("ignores judge entries with invalid data", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: JUDGE_STATS_CUSTOM_TYPE,
        data: { decision: "allowed" },
      } as unknown as SessionEntry,
    ];
    expect(formatJudgeLog(entries)).toBe("当前会话暂无法官判断");
  });

  it("formats a single allowed entry", () => {
    const text = formatJudgeLog([createJudgeLogEntry()]);
    expect(text).toBe(
      "当前会话法官判断（共 1 条）：\n1. bash: git status → 安全（8/10）\n   用途：查看 git 状态\n   理由：只读操作",
    );
  });

  it("formats a denied entry without score", () => {
    const text = formatJudgeLog([
      createJudgeLogEntry({
        decision: "denied",
        safe: false,
        score: undefined,
        reason: "危险命令",
        toolFor: "删除根目录",
      }),
    ]);
    expect(text).toBe(
      "当前会话法官判断（共 1 条）：\n1. bash: git status → 不安全\n   用途：删除根目录\n   理由：危险命令",
    );
  });

  it("truncates long values", () => {
    const longValue = "a".repeat(80);
    const text = formatJudgeLog([
      createJudgeLogEntry({ value: longValue }),
    ]);
    expect(text).toContain(`bash: ${"a".repeat(60)}... → 安全（8/10）`);
  });

  it("formats multiple entries in order", () => {
    const text = formatJudgeLog([
      createJudgeLogEntry({ toolName: "read", value: "a.txt" }),
      createJudgeLogEntry({ toolName: "write", value: "b.txt", safe: false, score: 2, reason: "写入文件", toolFor: "写入 b.txt" }),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toBe("当前会话法官判断（共 2 条）：");
    expect(lines[1]).toContain("read: a.txt → 安全");
    expect(lines[4]).toContain("write: b.txt → 不安全（2/10）");
  });
});
