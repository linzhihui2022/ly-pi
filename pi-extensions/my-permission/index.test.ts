import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";

// Mock @earendil-works/pi-ai before any imports load it
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    complete: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"safe":true,"reason":"ok","toolFor":"read"}' }],
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

import { decide } from "./rules";
import { createJudge } from "./judge";
import { confirmToolCall, isChildSession } from "./ui";

// Helper: create mock ExtensionAPI + tool_call invocation
function createMockApi() {
  const handlers: Record<string, Function> = {};
  return {
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    getHandler: (event: string) => handlers[event],
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
    const result = await handler(
      createBashEvent("rm -rf /"),
      createMockCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: "dangerous command",
    });
  });

  it("calls judge when rules return ask and judge says safe", async () => {
    vi.mocked(decide).mockReturnValue({ action: "ask", source: "defaultPolicy" });
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
  });

  it("blocks when rules return ask, judge says unsafe, and user denies", async () => {
    vi.mocked(decide).mockReturnValue({ action: "ask", source: "defaultPolicy" });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
        reason: "potentially destructive",
        toolFor: "delete files",
      }),
    );
    vi.mocked(confirmToolCall).mockResolvedValue(false);

    const api = createMockApi();
    const mod = await import("./index");
    await mod.default(api as any);

    const handler = api.getHandler("tool_call");
    const result = await handler(
      createBashEvent("rm -rf /tmp"),
      createMockCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: "potentially destructive",
    });
  });

  it("blocks in child session when judge says unsafe", async () => {
    vi.mocked(decide).mockReturnValue({ action: "ask", source: "defaultPolicy" });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue({
        safe: false,
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

  it("blocks when no judge result and no UI", async () => {
    vi.mocked(decide).mockReturnValue({ action: "ask", source: "defaultPolicy" });
    vi.mocked(createJudge).mockReturnValue(
      vi.fn().mockResolvedValue(undefined),
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
      reason: "Denied in non-interactive or subagent session",
    });
  });
});
