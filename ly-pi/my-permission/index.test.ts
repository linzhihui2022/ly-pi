import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", async (importOriginal) => {
  const { config } = await importOriginal<typeof import("./config")>();
  return {
    config: {
      ...config,
      defaultPolicy: "ask",
      judgeTimeoutMs: 5000,
      permission: {},
    },
  };
});
vi.mock("./rules", () => ({ decide: vi.fn(() => ({ action: "ask" })) }));
vi.mock("./judge", () => ({ createJudge: vi.fn(() => vi.fn()) }));
vi.mock("./professor", () => ({
  createAdvocate: vi.fn(),
  createMerger: vi.fn(),
}));
vi.mock("./prosecutor", () => ({ createProsecutor: vi.fn() }));
vi.mock("./chief", () => ({
  createChief: vi.fn(),
  createChiefMerger: vi.fn(),
}));
vi.mock("./pipeline", () => ({ createMerger: vi.fn() }));
vi.mock("./self-test", () => ({ runPermissionSelfTest: vi.fn() }));
vi.mock("./stats", () => ({
  collectAllowed: vi.fn(() => [{ toolName: "bash" }]),
  collectDeniedThenApproved: vi.fn(() => [{ toolName: "bash" }]),
  collectJudgeLogs: vi.fn(() => []),
  recordJudgeStats: vi.fn(),
  recordUserOverride: vi.fn(),
}));
vi.mock("./cost-tracker", () => ({
  aggregateCosts: vi.fn(),
  appendCost: vi.fn(),
}));
vi.mock("./ui", () => ({
  confirmToolCall: vi.fn(),
  createSessionCache: vi.fn(() => ({
    approve: vi.fn(),
    isApproved: vi.fn(() => false),
  })),
  isChildSession: vi.fn(() => false),
}));
vi.mock("./file", () => ({
  loadFile: vi.fn(() => "existing rule"),
}));
vi.mock("../web-preview/preview", () => ({
  servePreviewFile: vi.fn(),
  stopPreviewServer: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  writeFileSync: vi.fn(),
}));

import { writeFileSync } from "node:fs";
import { createChief } from "./chief";
import { appendCost } from "./cost-tracker";
import { loadFile } from "./file";
import { createJudge } from "./judge";
import { createMerger as createPipelineMerger } from "./pipeline";
import { createAdvocate } from "./professor";
import { createProsecutor } from "./prosecutor";
import { runPermissionSelfTest } from "./self-test";
import { collectDeniedThenApproved } from "./stats";

const auditBinding = {
  model: "openai-codex/gpt-6-astra",
  thinking: "max",
};

function createMockApi() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const commands: Record<string, { handler: (...args: any[]) => any }> = {};
  const tools: Record<string, { execute: (...args: any[]) => any }> = {};
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      handlers[event] = handler;
    }),
    registerCommand: vi.fn(
      (name: string, command: { handler: (...args: any[]) => any }) => {
        commands[name] = command;
      },
    ),
    registerTool: vi.fn(
      (tool: { name: string; execute: (...args: any[]) => any }) => {
        tools[tool.name] = tool;
      },
    ),
    appendEntry: vi.fn(),
    getHandler: (event: string) => handlers[event],
    getCommand: (name: string) => commands[name],
    getTool: (name: string) => tools[name],
  };
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/repo",
    hasUI: true,
    modelRegistry: { find: vi.fn(), complete: vi.fn() },
    sessionManager: {
      getEntries: () => [],
      getSessionId: () => "session-xyz",
    },
    ui: {
      confirm: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
    },
    ...overrides,
  };
}

async function loadExtension(api: ReturnType<typeof createMockApi>) {
  const mod = await import("./index");
  await mod.default(api as unknown as ExtensionAPI);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("my-permission direct bindings", () => {
  it("passes the configured Audit Direct Model Binding to Advocate and its merger", async () => {
    const advocate = vi.fn().mockResolvedValue({
      suggestion: {
        add: [{ rule: "允许 git status", reason: "误判" }],
        remove: [],
      },
      cost: 0.001,
      modelUsed: "openai-codex/gpt-6-astra",
    });
    const merger = vi.fn().mockResolvedValue({
      mergedText: "允许 git status",
      cost: 0.002,
      modelUsed: "openai-codex/gpt-6-astra",
    });
    vi.mocked(createAdvocate).mockReturnValue(advocate);
    vi.mocked(createPipelineMerger).mockReturnValue(merger);
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext();

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, ctx);

    expect(createAdvocate).toHaveBeenCalledWith(
      expect.anything(),
      auditBinding,
    );
    expect(createPipelineMerger).toHaveBeenCalledWith(
      expect.anything(),
      auditBinding,
    );
    expect(merger).toHaveBeenCalledWith({
      current: "existing rule",
      operations: ["允许 git status"],
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("JUDGE.md"),
      "允许 git status",
      "utf-8",
    );
    expect(appendCost).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条规则" }],
    });
  });

  it("does not write JUDGE.md when Advocate analysis fails", async () => {
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({ error: "audit failed" }),
    );
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, createContext());

    expect(result).toMatchObject({
      content: [{ type: "text", text: "辩护人分析失败: audit failed" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("does not write JUDGE.md when Advocate merge fails", async () => {
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: {
          add: [{ rule: "允许 git status", reason: "误判" }],
          remove: [],
        },
      }),
    );
    vi.mocked(createPipelineMerger).mockReturnValue(
      vi.fn().mockResolvedValue({ error: "audit failed" }),
    );
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, createContext());

    expect(result).toMatchObject({
      content: [{ type: "text", text: "融合失败: audit failed" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("passes the configured Audit Direct Model Binding to Prosecutor", async () => {
    const prosecutor = vi.fn().mockResolvedValue({ error: "audit failed" });
    vi.mocked(createProsecutor).mockReturnValue(prosecutor);
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_prosecutor")
      .execute("call", {}, undefined, undefined, createContext());

    expect(createProsecutor).toHaveBeenCalledWith(
      expect.anything(),
      auditBinding,
    );
    expect(result).toMatchObject({
      content: [{ type: "text", text: "检察官分析失败: audit failed" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("passes the configured Audit Direct Model Binding to Chief Judge", async () => {
    const chief = vi.fn().mockResolvedValue({ error: "audit failed" });
    vi.mocked(createChief).mockReturnValue(chief);
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_chief")
      .execute("call", {}, undefined, undefined, createContext());

    expect(createChief).toHaveBeenCalledWith(expect.anything(), auditBinding);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "审判长分析失败: audit failed" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("runs permission self-test without a policy runner", async () => {
    vi.mocked(runPermissionSelfTest).mockResolvedValue({
      status: "success",
      report: "对抗性自测报告",
      attackResults: [],
      safeResults: [],
      attackMetrics: {
        precision: 1,
        recall: 1,
        f1: 1,
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
      },
      safeMetrics: {
        precision: 1,
        recall: 1,
        f1: 1,
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
      },
      overallPrecision: 1,
    });
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext();

    await api.getCommand("permission-self-test").handler("", ctx);

    expect(runPermissionSelfTest).toHaveBeenCalledWith(
      expect.objectContaining({ judgePrompt: expect.any(String) }),
    );
    expect(
      vi.mocked(runPermissionSelfTest).mock.calls[0]?.[0],
    ).not.toHaveProperty("modelRunner");
    expect(ctx.ui.notify).toHaveBeenCalledWith("对抗性自测报告", "info");
  });

  it("passes the configured Judge binding through the ordinary tool-call path", async () => {
    const judge = vi.fn().mockResolvedValue({
      safe: true,
      score: 8,
      reason: "safe",
      toolFor: "read",
    });
    vi.mocked(createJudge).mockReturnValue(judge);
    const api = createMockApi();
    await loadExtension(api);

    const result = await api.getHandler("tool_call")(
      { toolName: "bash", input: { command: "git status" } },
      createContext(),
    );

    expect(createJudge).toHaveBeenCalledWith(
      expect.objectContaining({ judgeModel: "deepseek/deepseek-flash" }),
      expect.not.objectContaining({ modelRunner: expect.anything() }),
    );
    expect(result).toBeUndefined();
  });

  it("merges and writes JUDGE.md when Prosecutor suggestions are accepted", async () => {
    const prosecutor = vi.fn().mockResolvedValue({
      suggestion: {
        add: [{ rule: "拦截 rm -rf", reason: "漏审" }],
        summary: "发现 1 条",
      },
      cost: 0.001,
      modelUsed: "model",
    });
    const merger = vi.fn().mockResolvedValue({
      mergedText: "拦截 rm -rf",
      cost: 0.002,
      modelUsed: "model",
    });
    vi.mocked(createProsecutor).mockReturnValue(prosecutor);
    vi.mocked(createPipelineMerger).mockReturnValue(merger);
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext();

    const result = await api
      .getTool("permission_prosecutor")
      .execute("call", {}, undefined, undefined, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "⚖️ 检察官审计: 发现 1 条",
      "info",
    );
    expect(merger).toHaveBeenCalledWith({
      current: "existing rule",
      operations: ["拦截 rm -rf"],
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("JUDGE.md"),
      "拦截 rm -rf",
      "utf-8",
    );
    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条规则" }],
    });
  });

  it("merges and writes JUDGE.md when Chief suggestions are accepted", async () => {
    const chief = vi.fn().mockResolvedValue({
      suggestion: {
        suggestions: [{ type: "add", rule: "新规则", reason: "矛盾" }],
        summary: "1 条建议",
      },
      cost: 0.001,
      modelUsed: "model",
    });
    const merger = vi.fn().mockResolvedValue({
      mergedText: "新规则",
      cost: 0.002,
      modelUsed: "model",
    });
    vi.mocked(createChief).mockReturnValue(chief);
    vi.mocked(createPipelineMerger).mockReturnValue(merger);
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext();

    const result = await api
      .getTool("permission_chief")
      .execute("call", {}, undefined, undefined, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "👨‍⚖️ 审判长审计: 1 条建议",
      "info",
    );
    expect(merger).toHaveBeenCalledWith({
      current: "existing rule",
      operations: [{ type: "add", rule: "新规则", reason: "矛盾" }],
    });
    expect(writeFileSync).toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条操作" }],
    });
  });

  it("skips the Chief audit when JUDGE.md is missing", async () => {
    // First call is the entry point's localJudge, second is the Chief tool.
    vi.mocked(loadFile)
      .mockReturnValueOnce("existing rule")
      .mockReturnValueOnce("");
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_chief")
      .execute("call", {}, undefined, undefined, createContext());

    expect(createChief).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "项目尚未创建 JUDGE.md，无需审计。" }],
    });
  });

  it("leaves JUDGE.md untouched when the user declines the merged diff", async () => {
    const prosecutor = vi.fn().mockResolvedValue({
      suggestion: {
        add: [{ rule: "拦截 rm -rf", reason: "漏审" }],
        summary: "发现 1 条",
      },
      cost: 0.001,
      modelUsed: "model",
    });
    const merger = vi.fn().mockResolvedValue({
      mergedText: "拦截 rm -rf",
      cost: 0.002,
      modelUsed: "model",
    });
    vi.mocked(createProsecutor).mockReturnValue(prosecutor);
    vi.mocked(createPipelineMerger).mockReturnValue(merger);
    const api = createMockApi();
    await loadExtension(api);
    const confirm = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const ctx = createContext({ ui: { confirm, notify: vi.fn() } });

    const result = await api
      .getTool("permission_prosecutor")
      .execute("call", {}, undefined, undefined, ctx);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "已放弃，JUDGE.md 未修改" }],
    });
  });

  it("leaves JUDGE.md untouched when every Chief suggestion is declined", async () => {
    const chief = vi.fn().mockResolvedValue({
      suggestion: {
        suggestions: [{ type: "add", rule: "新规则", reason: "矛盾" }],
        summary: "1 条建议",
      },
      cost: 0.001,
      modelUsed: "model",
    });
    vi.mocked(createChief).mockReturnValue(chief);
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext({
      ui: { confirm: vi.fn().mockResolvedValue(false), notify: vi.fn() },
    });

    const result = await api
      .getTool("permission_chief")
      .execute("call", {}, undefined, undefined, ctx);

    expect(createPipelineMerger).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "未采纳任何建议，JUDGE.md 未修改" }],
    });
  });

  it("reports when the session has no misjudged cases", async () => {
    vi.mocked(collectDeniedThenApproved).mockReturnValueOnce([]);
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, createContext());

    expect(createAdvocate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: "当前会话没有法官误判案例，法官表现完美！",
        },
      ],
    });
  });

  it("reports when the Advocate finds nothing to change", async () => {
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: { add: [], remove: [] },
        cost: 0.001,
        modelUsed: "model",
      }),
    );
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, createContext());

    expect(createPipelineMerger).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: "辩护人认为当前 JUDGE.md 已覆盖所有误判模式，无需修改",
        },
      ],
    });
  });

  it("notifies about the stale rules the Advocate wants removed", async () => {
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: {
          add: [{ rule: "R1", reason: "误判" }],
          remove: ["旧规则 A", "旧规则 B"],
        },
        cost: 0.001,
        modelUsed: "model",
      }),
    );
    const merger = vi.fn().mockResolvedValue({
      mergedText: "R1",
      cost: 0.002,
      modelUsed: "model",
    });
    vi.mocked(createPipelineMerger).mockReturnValue(merger);
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext();

    await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "💡 辩护人建议手动删除 2 条过时规则（需手动处理）",
      "info",
    );
    expect(merger).toHaveBeenCalledWith({
      current: "existing rule",
      operations: ["R1"],
    });
  });

  it("leaves JUDGE.md untouched when every Advocate rule is declined", async () => {
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: { add: [{ rule: "R1", reason: "误判" }], remove: [] },
        cost: 0.001,
        modelUsed: "model",
      }),
    );
    const api = createMockApi();
    await loadExtension(api);
    const ctx = createContext({
      ui: { confirm: vi.fn().mockResolvedValue(false), notify: vi.fn() },
    });

    const result = await api
      .getTool("permission_advocate")
      .execute("call", {}, undefined, undefined, ctx);

    expect(createPipelineMerger).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "未采纳任何规则，JUDGE.md 未修改" }],
    });
  });
});
