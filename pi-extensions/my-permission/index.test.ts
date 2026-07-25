import type { Api, Model } from "@earendil-works/pi-ai";
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
  loadConfig: vi.fn().mockResolvedValue({
    defaultPolicy: "ask",
    judgeModel: "deepseek/deepseek-v4-flash",
    judgeTimeoutMs: 5000,
    childPolicy: "deny-on-unsafe",
    permission: {
      path: { "*": "allow", "*.env": "deny" },
      read: "allow",
      bash: { "*": "ask", "rm -rf *": "deny" },
    },
  }),
}));

vi.mock("./rules", () => ({
  decide: vi.fn(),
}));

vi.mock("./judge", () => ({
  createJudge: vi.fn(() => vi.fn()),
}));

vi.mock("./ui", () => ({
  confirmToolCall: vi.fn(),
  createSessionCache: vi.fn(() => ({
    approve: vi.fn(),
    isApproved: vi.fn().mockReturnValue(false),
  })),
  isChildSession: vi.fn().mockReturnValue(false),
}));

import { createJudge } from "./judge";
import { decide } from "./rules";
import { confirmToolCall, isChildSession } from "./ui";

// Helper: create mock ExtensionAPI + tool_call invocation
function createMockApi() {
  const handlers: Record<string, Function> = {};
  const commands: Record<string, Function> = {};
  return {
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    registerCommand: vi.fn((name: string, options: { handler: Function }) => {
      commands[name] = options.handler;
    }),
    getHandler: (event: string) => handlers[event],
    getCommand: (name: string) => commands[name],
    appendEntry: vi.fn(),
  };
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/repo",
    hasUI: true,
    model: { id: "deepseek-v4-flash", provider: "deepseek" } as Model<Api>,
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
    const mod = await import("./index");
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
    await mod.default(api as any);

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
    await mod.default(api as any);

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
    await mod.default(api as any);

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
    await mod.default(api as any);

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
    await mod.default(api as any);

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
    await mod.default(api as any);

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

describe("/judge-log command", () => {
  function createMockCtxWithEntries(entries: unknown[]) {
    return createMockCtx({
      sessionManager: { getEntries: () => entries },
    });
  }

  it("notifies empty message when no judge entries", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as any);

    const cmd = api.getCommand("judge-log");
    const ctx = createMockCtxWithEntries([]);
    await cmd("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("当前会话暂无法官判断", "info");
  });

  it("formats and notifies judge entries", async () => {
    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as any);

    const entries = [
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
    const ctx = createMockCtxWithEntries(entries);
    const cmd = api.getCommand("judge-log");
    await cmd("", ctx);

    const notifyArg = ctx.ui.notify.mock.calls[0][0] as string;
    expect(notifyArg).toContain("当前会话法官判断（共 2 条）");
    expect(notifyArg).toContain("bash: git status → 安全（8/10）");
    expect(notifyArg).toContain("bash: rm -rf /tmp → 不安全（2/10）");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "info");
  });
});
