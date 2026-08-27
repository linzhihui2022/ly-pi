import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  config: {
    defaultPolicy: "ask",
    judgeModel: "openai-codex/gpt-5.6-luna",
    auditModel: "openai-codex/gpt-5.6-sol",
    auditThinking: "high",
    judgeTimeoutMs: 5000,
    childPolicy: "deny-on-unsafe",
    permission: {},
  },
}));
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
vi.mock("../src/shared/file", () => ({
  loadFile: vi.fn(() => "existing rule"),
}));
vi.mock("../src/shared/preview", () => ({
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
import { createJudge } from "./judge";
import { createMerger as createPipelineMerger } from "./pipeline";
import { createAdvocate } from "./professor";
import { createProsecutor } from "./prosecutor";
import { runPermissionSelfTest } from "./self-test";

const auditBinding = {
  model: "openai-codex/gpt-5.6-sol",
  thinking: "high",
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
  it("passes the Sol Direct Model Binding to Advocate and its merger", async () => {
    const advocate = vi.fn().mockResolvedValue({
      suggestion: {
        add: [{ rule: "允许 git status", reason: "误判" }],
        remove: [],
      },
      cost: 0.001,
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
    const merger = vi.fn().mockResolvedValue({
      mergedText: "允许 git status",
      cost: 0.002,
      modelUsed: "openai-codex/gpt-5.6-sol",
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

  it("passes the Sol Direct Model Binding to Prosecutor", async () => {
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

  it("passes the Sol Direct Model Binding to Chief Judge", async () => {
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
      expect.objectContaining({ judgeModel: "openai-codex/gpt-5.6-luna" }),
      expect.not.objectContaining({ modelRunner: expect.anything() }),
    );
    expect(result).toBeUndefined();
  });
});
