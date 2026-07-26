import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  collectAllowed,
  collectDeniedThenApproved,
  collectJudgeLogs,
  JUDGE_OVERRIDE_CUSTOM_TYPE,
  JUDGE_STATS_CUSTOM_TYPE,
  type JudgeLogEntry,
  recordJudgeStats,
  recordUserOverride,
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

  it("records cost when present", () => {
    const pi = createMockPi();
    recordJudgeStats(
      pi,
      { toolName: "bash", value: "git status" },
      {
        safe: true,
        score: 8,
        reason: "安全",
        toolFor: "git状态",
        cost: 0.000085,
      },
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(JUDGE_STATS_CUSTOM_TYPE, {
      decision: "allowed",
      toolName: "bash",
      value: "git status",
      safe: true,
      score: 8,
      reason: "安全",
      toolFor: "git状态",
      cost: 0.000085,
    });
  });

  it("omits cost when undefined", () => {
    const pi = createMockPi();
    recordJudgeStats(
      pi,
      { toolName: "bash", value: "ls" },
      { safe: true, reason: "安全", toolFor: "列表" },
    );
    const callArg = (pi.appendEntry as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("cost");
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
    expect(logs[0].userApproved).toBeUndefined();
    expect(logs[1].toolName).toBe("write");
    expect(logs[1].safe).toBe(false);
    expect(logs[1].userApproved).toBe(false);
  });

  it("omits score when not a number", () => {
    const logs = collectJudgeLogs([createJudgeLogEntry({ score: undefined })]);
    expect(logs[0].score).toBeUndefined();
  });

  it("marks userApproved true when override entry exists", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm -rf dist",
        reason: "危险",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "rm -rf dist" },
      } as unknown as SessionEntry,
    ];
    const logs = collectJudgeLogs(entries);
    expect(logs).toHaveLength(1);
    expect(logs[0].userApproved).toBe(true);
  });

  it("marks userApproved false when no override entry", () => {
    const logs = collectJudgeLogs([
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "sudo rm /",
        reason: "危险",
      }),
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0].userApproved).toBe(false);
  });
});

describe("recordUserOverride", () => {
  it("records user override after judge denial", () => {
    const pi = createMockPi();
    recordUserOverride(pi, {
      toolName: "bash",
      value: "rm -rf dist",
      paths: ["dist/"],
    });
    expect(pi.appendEntry).toHaveBeenCalledWith(JUDGE_OVERRIDE_CUSTOM_TYPE, {
      toolName: "bash",
      value: "rm -rf dist",
    });
  });
});

describe("collectDeniedThenApproved", () => {
  it("returns empty when no judge entries", () => {
    expect(collectDeniedThenApproved([])).toEqual([]);
  });

  it("returns empty when judge denied but no user override", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm file",
        reason: "危险",
      }),
    ];
    expect(collectDeniedThenApproved(entries)).toEqual([]);
  });

  it("returns empty when user override without prior judge denial", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "some cmd" },
      } as unknown as SessionEntry,
    ];
    expect(collectDeniedThenApproved(entries)).toEqual([]);
  });

  it("matches judge denied with user override by toolName and value", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm -rf dist",
        reason: "删除操作",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "rm -rf dist" },
      } as unknown as SessionEntry,
    ];
    const result = collectDeniedThenApproved(entries);
    expect(result).toHaveLength(1);
    expect(result[0].toolName).toBe("bash");
    expect(result[0].value).toBe("rm -rf dist");
    expect(result[0].judgeReason).toBe("删除操作");
    expect(result[0].context).toEqual([]);
  });

  it("does not match judge allowed entries", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: true,
        toolName: "bash",
        value: "git log",
        reason: "安全",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "git log" },
      } as unknown as SessionEntry,
    ];
    expect(collectDeniedThenApproved(entries)).toEqual([]);
  });

  it("handles value containing colons", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "echo 'a:b:c'",
        reason: "含冒号",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "echo 'a:b:c'" },
      } as unknown as SessionEntry,
    ];
    const result = collectDeniedThenApproved(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("echo 'a:b:c'");
  });

  it("captures preceding 3 messages as context", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "帮我清理 dist 目录" }],
        },
      } as unknown as SessionEntry,
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "好的，我来执行 rm -rf dist" }],
        },
      } as unknown as SessionEntry,
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "确认" }],
        },
      } as unknown as SessionEntry,
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm -rf dist",
        reason: "删除操作",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "rm -rf dist" },
      } as unknown as SessionEntry,
    ];
    const result = collectDeniedThenApproved(entries);
    expect(result).toHaveLength(1);
    expect(result[0].context).toHaveLength(3);
    expect(result[0].context[0].role).toBe("user");
    expect(result[0].context[0].content).toBe("帮我清理 dist 目录");
    expect(result[0].context[2].role).toBe("user");
    expect(result[0].context[2].content).toBe("确认");
  });

  it("keeps only the last 3 messages as context", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "msg1" }] },
      } as unknown as SessionEntry,
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "msg2" }] },
      } as unknown as SessionEntry,
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "msg3" }] },
      } as unknown as SessionEntry,
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "msg4" }] },
      } as unknown as SessionEntry,
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm file",
        reason: "危险",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "rm file" },
      } as unknown as SessionEntry,
    ];
    const result = collectDeniedThenApproved(entries);
    expect(result[0].context).toHaveLength(3);
    expect(result[0].context[0].content).toBe("msg2");
    expect(result[0].context[2].content).toBe("msg4");
  });

  it("matches multiple denied-then-approved pairs", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm -rf dist",
        reason: "删除操作",
      }),
      createJudgeLogEntry({
        safe: false,
        toolName: "write",
        value: "/etc/hosts",
        reason: "系统文件",
      }),
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "bash", value: "rm -rf dist" },
      } as unknown as SessionEntry,
      {
        type: "custom",
        customType: JUDGE_OVERRIDE_CUSTOM_TYPE,
        data: { toolName: "write", value: "/etc/hosts" },
      } as unknown as SessionEntry,
    ];
    const result = collectDeniedThenApproved(entries);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.toolName)).toEqual(["bash", "write"]);
    expect(result[0].context).toEqual([]);
  });
});

describe("collectAllowed", () => {
  it("returns empty array when no entries", () => {
    expect(collectAllowed([])).toEqual([]);
  });

  it("returns empty array when no judge entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: { role: "user", content: "hi" },
      } as unknown as SessionEntry,
    ];
    expect(collectAllowed(entries)).toEqual([]);
  });

  it("returns only allowed (safe=true) judge entries", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: true,
        toolName: "bash",
        value: "git status",
        score: 8,
      }),
    ];
    const result = collectAllowed(entries);
    expect(result).toHaveLength(1);
    expect(result[0].safe).toBe(true);
    expect(result[0].toolName).toBe("bash");
    expect(result[0].value).toBe("git status");
  });

  it("excludes denied (safe=false) judge entries", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "rm -rf /",
      }),
    ];
    expect(collectAllowed(entries)).toEqual([]);
  });

  it("filters mixed safe/unsafe entries", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: true,
        toolName: "bash",
        value: "git log",
        score: 9,
      }),
      createJudgeLogEntry({
        safe: false,
        toolName: "bash",
        value: "sudo rm /",
      }),
      createJudgeLogEntry({
        safe: true,
        toolName: "read",
        value: "src/main.ts",
        score: 10,
      }),
    ];
    const result = collectAllowed(entries);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe("git log");
    expect(result[1].value).toBe("src/main.ts");
  });

  it("ignores entries with invalid data", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: JUDGE_STATS_CUSTOM_TYPE,
        data: { decision: "allowed" },
      } as unknown as SessionEntry,
      createJudgeLogEntry({
        safe: true,
        toolName: "read",
        value: "ok.txt",
        score: 7,
      }),
    ];
    const result = collectAllowed(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("ok.txt");
  });

  it("preserves score when present", () => {
    const entries: SessionEntry[] = [
      createJudgeLogEntry({
        safe: true,
        toolName: "bash",
        value: "bun test",
        score: 6,
      }),
    ];
    const result = collectAllowed(entries);
    expect(result[0].score).toBe(6);
  });
});
