import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Mock @earendil-works/pi-ai before any imports load it
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    complete: vi.fn().mockResolvedValue({
      content: [
        { type: "text", text: '{"safe":true,"reason":"ok","toolFor":"read"}' },
      ],
    }),
  };
});

// Mock all internal modules
vi.mock("./config", () => ({
  config: {
    defaultPolicy: "ask",
    judgeTimeoutMs: 5000,
    childPolicy: "deny-on-unsafe",
    permission: {
      path: { "*": "allow", "*.env": "deny" },
      read: "allow",
      bash: { "*": "ask", "rm -rf *": "deny" },
    },
  },
}));

vi.mock("./rules", () => ({
  decide: vi.fn(),
}));

vi.mock("./judge", () => ({
  createJudge: vi.fn(() => vi.fn()),
}));

vi.mock("../model-policy/config", () => ({
  loadModelPolicyRegistry: vi.fn(),
}));

vi.mock("../src/shared/file", () => ({
  loadFile: vi.fn(() => "existing rule"),
}));

vi.mock("./professor", () => ({
  createAdvocate: vi.fn(),
}));

vi.mock("./prosecutor", () => ({
  createProsecutor: vi.fn(),
}));

vi.mock("./chief", () => ({
  createChief: vi.fn(),
}));

vi.mock("./pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pipeline")>();
  return { ...actual, createMerger: vi.fn() };
});

vi.mock("./cost-tracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cost-tracker")>();
  return { ...actual, appendCost: vi.fn() };
});

vi.mock("./self-test", () => ({
  runPermissionSelfTest: vi.fn(),
}));

vi.mock("./ui", () => ({
  confirmToolCall: vi.fn(),
  createSessionCache: vi.fn(() => ({
    approve: vi.fn(),
    isApproved: vi.fn().mockReturnValue(false),
  })),
  isChildSession: vi.fn().mockReturnValue(false),
}));

vi.mock("open", () => ({ default: vi.fn(() => Promise.resolve()) }));

vi.mock("../web-preview/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../web-preview/index")>();
  return {
    ...actual,
    ensurePreviewServer: vi.fn(() =>
      Promise.resolve({
        port: 3456,
        url: "http://localhost:3456",
        server: {} as unknown as Record<string, never>,
      }),
    ),
    stopPreviewServer: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { mkdirSync, writeFileSync } from "node:fs";
import open from "open";
import { loadModelPolicyRegistry } from "../model-policy/config";
import { ensurePreviewServer, stopPreviewServer } from "../web-preview/index";
import { createChief } from "./chief";
import { appendCost } from "./cost-tracker";
import { createJudge } from "./judge";
import { createMerger as createPipelineMerger } from "./pipeline";
import { createAdvocate } from "./professor";
import { createProsecutor } from "./prosecutor";
import { decide } from "./rules";
import { runPermissionSelfTest } from "./self-test";
import { confirmToolCall, isChildSession } from "./ui";

// Helper: create mock ExtensionAPI + tool_call invocation
function createMockApi() {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const commands: Record<string, (...args: unknown[]) => unknown> = {};
  const tools: Record<
    string,
    { name: string; execute: (...args: unknown[]) => unknown }
  > = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
    registerCommand: vi.fn(
      (name: string, options: { handler: (...args: unknown[]) => unknown }) => {
        commands[name] = options.handler;
      },
    ),
    registerTool: vi.fn(
      (tool: { name: string; execute: (...args: unknown[]) => unknown }) => {
        tools[tool.name] = tool;
      },
    ),
    getHandler: (event: string) => handlers[event],
    getCommand: (name: string) => commands[name],
    getTool: (name: string) => tools[name],
    appendEntry: vi.fn(),
  };
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/repo",
    hasUI: true,
    model: { id: "test-model", provider: "test" } as Model<Api>,
    modelRegistry: { find: vi.fn() },
    ui: { confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
    ...overrides,
  };
}

function createBashEvent(command: string) {
  return {
    toolName: "bash",
    toolCallId: "call-1",
    input: { command },
  };
}

describe("my-permission extension entry", () => {
  beforeAll(async () => {
    // load the extension factory (only once)
    const _mod = await import("./index");
    // Reset mocks in case other tests ran
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows a read tool call when rules return allow", async () => {
    vi.mocked(decide).mockReturnValue({ action: "allow", source: "read" });

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const result = await handler(createBashEvent("ls"), createMockCtx());
    expect(result).toBeUndefined();
  });

  it("blocks a tool call when rules return deny", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "deny",
      source: "bash",
      reason: "dangerous command",
    });

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const result = await handler(createBashEvent("rm -rf /"), createMockCtx());
    expect(result).toEqual({
      block: true,
      reason: "dangerous command",
    });
  });

  it("calls judge when rules return ask and judge says safe", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    const mockJudge = vi.fn().mockResolvedValue({
      safe: true,
      reason: "safe operation",
      toolFor: "read file",
    });
    vi.mocked(createJudge).mockReturnValue(mockJudge);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const result = await handler(
      createBashEvent("cat README.md"),
      createMockCtx(),
    );
    expect(result).toBeUndefined();
    expect(mockJudge).toHaveBeenCalled();
    expect(api.appendEntry).toHaveBeenCalledWith("my-permission-judge", {
      decision: "allowed",
      toolName: "bash",
      value: "cat README.md",
      safe: true,
      reason: "safe operation",
      toolFor: "read file",
    });
  });

  it("does not pass the parent session model to judge", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    const mockJudge = vi.fn().mockResolvedValue({
      safe: true,
      reason: "safe operation",
      toolFor: "read file",
    });
    vi.mocked(createJudge).mockReturnValue(mockJudge);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    await api.getHandler("tool_call")(
      createBashEvent("cat README.md"),
      createMockCtx({
        model: { id: "parent-model", provider: "local" } as Model<Api>,
      }),
    );

    expect(vi.mocked(createJudge).mock.calls[0]?.[1]).not.toHaveProperty(
      "model",
    );
    expect(mockJudge.mock.calls[0]).toHaveLength(2);
    expect(mockJudge.mock.calls[0]?.[1]).toBe("/repo");
  });

  it("allows a failed judge call after user confirmation and records override", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
        score: 2,
        reason: "no usable candidate",
        toolFor: "read file",
      }),
    );
    vi.mocked(confirmToolCall).mockResolvedValue(true);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const ctx = createMockCtx();
    await expect(
      handler(createBashEvent("cat README.md"), ctx),
    ).resolves.toBeUndefined();

    expect(confirmToolCall).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        toolName: "bash",
        reason: "no usable candidate",
      }),
    );
    expect(api.appendEntry).toHaveBeenCalledWith("my-permission-override", {
      toolName: "bash",
      value: "cat README.md",
    });
  });

  it("blocks when rules return ask, judge says unsafe, and user denies", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
        score: 3,
        reason: "potentially destructive",
        toolFor: "delete files",
      }),
    );
    vi.mocked(confirmToolCall).mockResolvedValue(false);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const ctx = createMockCtx();
    const result = await handler(createBashEvent("rm -rf /tmp"), ctx);
    expect(result).toEqual({
      block: true,
      reason: "User denied: potentially destructive",
    });
    expect(api.appendEntry).toHaveBeenCalledWith("my-permission-judge", {
      decision: "denied",
      toolName: "bash",
      value: "rm -rf /tmp",
      safe: false,
      score: 3,
      reason: "potentially destructive",
      toolFor: "delete files",
    });
  });

  it("blocks in child session when judge says unsafe", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
        score: 2,
        reason: "unsafe in child",
        toolFor: "dangerous operation",
      }),
    );
    vi.mocked(isChildSession).mockReturnValue(true);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const result = await handler(
      createBashEvent("sudo rm -rf /"),
      createMockCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: "unsafe in child",
    });
  });

  it("blocks when judge fails and no UI", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "ask",
      source: "defaultPolicy",
    });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
        reason: "未找到可用的法官模型，请手动确认",
        toolFor: "bash curl http://evil.com",
      }),
    );

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const handler = api.getHandler("tool_call");
    const result = await handler(
      createBashEvent("curl http://evil.com"),
      createMockCtx({ hasUI: false }),
    );
    expect(result).toEqual({
      block: true,
      reason: "未找到可用的法官模型，请手动确认",
    });
  });
});

describe("security audit tools", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function createAdvocateEntries() {
    return [
      {
        type: "custom",
        customType: "my-permission-judge",
        data: {
          toolName: "bash",
          value: "git status",
          safe: false,
          reason: "needs confirmation",
        },
      },
      {
        type: "custom",
        customType: "my-permission-override",
        data: { toolName: "bash", value: "git status" },
      },
    ];
  }

  function createAllowedEntries() {
    return [
      {
        type: "custom",
        customType: "my-permission-judge",
        data: {
          toolName: "bash",
          value: "git status",
          safe: true,
          reason: "read only",
          toolFor: "status",
        },
      },
    ];
  }

  function createSecurityAuditCtx(entries = createAdvocateEntries()) {
    return createMockCtx({
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-xyz",
      },
    });
  }

  it("does not write JUDGE.md when Advocate analysis fails", async () => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({ error: "rate limit exceeded" }),
    );

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const result = await api
      .getTool("permission_advocate")
      .execute("call-1", {}, undefined, undefined, createSecurityAuditCtx());

    expect(createAdvocate).toHaveBeenCalledWith(expect.anything(), modelRunner);
    expect(result).toMatchObject({
      content: [{ type: "text", text: "辩护人分析失败: rate limit exceeded" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it.each([
    [
      "merger error",
      { error: "rate limit exceeded" },
      "融合失败: rate limit exceeded",
    ],
    ["empty merger output", { mergedText: "" }, "融合失败: 空内容"],
  ] as const)("does not write JUDGE.md when Advocate merge returns %s", async (_label, mergeResult, expectedText) => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: {
          add: [{ rule: "允许 git status", reason: "false positive" }],
          remove: [],
        },
      }) as never,
    );
    vi.mocked(createPipelineMerger).mockReturnValue(
      vi.fn().mockResolvedValue(mergeResult) as never,
    );

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const ctx = createSecurityAuditCtx();
    const result = await api
      .getTool("permission_advocate")
      .execute("call-1", {}, undefined, undefined, ctx);

    expect(result).toMatchObject({
      content: [{ type: "text", text: expectedText }],
    });
    expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(appendCost).not.toHaveBeenCalled();
  });

  it("preserves approval and costs when Advocate analysis and merge succeed", async () => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    vi.mocked(createAdvocate).mockReturnValue(
      vi.fn().mockResolvedValue({
        suggestion: {
          add: [{ rule: "允许 git status", reason: "false positive" }],
          remove: [],
        },
        cost: 0.001,
        modelUsed: "security/audit",
      }),
    );
    vi.mocked(createPipelineMerger).mockReturnValue(
      vi.fn().mockResolvedValue({
        mergedText: "允许 git status",
        cost: 0.002,
        modelUsed: "security/audit",
      }),
    );

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const ctx = createSecurityAuditCtx();
    const result = await api
      .getTool("permission_advocate")
      .execute("call-1", {}, undefined, undefined, ctx);

    expect(createPipelineMerger).toHaveBeenCalledWith(
      expect.anything(),
      modelRunner,
    );
    expect(appendCost).toHaveBeenNthCalledWith(
      1,
      "session-xyz",
      "/repo",
      "advocate-analysis",
      0.001,
      "security/audit",
    );
    expect(appendCost).toHaveBeenNthCalledWith(
      2,
      "session-xyz",
      "/repo",
      "advocate-merge",
      0.002,
      "security/audit",
    );
    expect(ctx.ui.confirm).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("JUDGE.md"),
      "允许 git status",
      "utf-8",
    );
    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条规则" }],
    });
  });

  it("wires the security-audit runner into Prosecutor", async () => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    const prosecutor = vi.fn().mockResolvedValue({ error: "audit failed" });
    vi.mocked(createProsecutor).mockReturnValue(prosecutor as never);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const result = await api
      .getTool("permission_prosecutor")
      .execute(
        "call-1",
        {},
        undefined,
        undefined,
        createSecurityAuditCtx(createAllowedEntries()),
      );

    expect(createProsecutor).toHaveBeenCalledWith(
      expect.anything(),
      modelRunner,
    );
    expect(prosecutor).toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "检察官分析失败: audit failed" }],
    });
  });

  it("wires the security-audit runner into Chief", async () => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    const chief = vi.fn().mockResolvedValue({ error: "audit failed" });
    vi.mocked(createChief).mockReturnValue(chief as never);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const result = await api
      .getTool("permission_chief")
      .execute("call-1", {}, undefined, undefined, createSecurityAuditCtx());

    expect(createChief).toHaveBeenCalledWith(expect.anything(), modelRunner);
    expect(chief).toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "审判长分析失败: audit failed" }],
    });
  });
});

describe("/permission-self-test command", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs self-test through the extension model registry", async () => {
    const modelRunner = { run: vi.fn() };
    vi.mocked(loadModelPolicyRegistry).mockReturnValue(modelRunner as never);
    vi.mocked(runPermissionSelfTest).mockResolvedValue({
      report: "对抗性自测报告\n结果: ✅ 达标",
    });

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const ctx = createMockCtx();
    await api.getCommand("permission-self-test")("", ctx);

    expect(runPermissionSelfTest).toHaveBeenCalledWith(
      expect.objectContaining({
        judgePrompt: expect.any(String),
        modelRunner,
      }),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "对抗性自测报告\n结果: ✅ 达标",
      "info",
    );
  });

  it("reports policy loading failure without running self-test", async () => {
    vi.mocked(loadModelPolicyRegistry).mockImplementation(() => {
      throw new Error("invalid manifest");
    });

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const ctx = createMockCtx();
    await api.getCommand("permission-self-test")("", ctx);

    expect(runPermissionSelfTest).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "权限自测失败: security-judge 模型策略不可用: invalid manifest",
      "error",
    );
  });
});

describe("/judge-log command", () => {
  function createMockCtxWithEntries(entries: unknown[]) {
    return createMockCtx({
      sessionManager: {
        getEntries: () => entries,
        getSessionId: () => "session-xyz",
      },
    });
  }

  const judgeEntries = [
    {
      type: "custom",
      customType: "my-permission-judge",
      data: {
        decision: "allowed",
        toolName: "bash",
        value: "git status",
        safe: true,
        score: 8,
        reason: "只读操作",
        toolFor: "查看 git 状态",
      },
    },
    {
      type: "custom",
      customType: "my-permission-judge",
      data: {
        decision: "denied",
        toolName: "bash",
        value: "rm -rf /tmp",
        safe: false,
        score: 2,
        reason: "危险命令",
        toolFor: "删除临时目录",
      },
    },
  ];

  it("notifies empty message and writes no file when no judge entries", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const cmd = api.getCommand("judge-log");
    const ctx = createMockCtxWithEntries([]);
    await cmd("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("当前会话暂无法官判断", "info");
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("renders judge log page, writes fixed file and opens preview", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    const ctx = createMockCtxWithEntries(judgeEntries);
    const cmd = api.getCommand("judge-log");
    await cmd("", ctx);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("session-xyz"),
      { recursive: true },
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("judge-log.html"),
      expect.stringContaining("法官判断日志"),
      "utf-8",
    );
    const writtenHtml = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(writtenHtml).toContain("git status");
    expect(writtenHtml).toContain("rm -rf /tmp");
    expect(ensurePreviewServer).toHaveBeenCalledWith({
      host: "127.0.0.1",
      urlHost: "localhost",
      port: 3456,
    });
    expect(open).toHaveBeenCalledWith(
      "http://localhost:3456/session-xyz/judge-log.html",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Preview: http://localhost:3456/session-xyz/judge-log.html",
      "info",
    );
  });

  it("notifies error when preview server fails to start", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    vi.mocked(ensurePreviewServer).mockRejectedValueOnce(
      new Error("port in use"),
    );
    const ctx = createMockCtxWithEntries(judgeEntries);
    const cmd = api.getCommand("judge-log");
    await cmd("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Failed to start preview server: port in use",
      "error",
    );
  });

  it("stops the preview server on session_shutdown", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as unknown as ExtensionAPI);

    await api.getHandler("session_shutdown")();
    expect(stopPreviewServer).toHaveBeenCalled();
  });
});
