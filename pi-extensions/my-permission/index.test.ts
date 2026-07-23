import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

// ── Mocks ──

const mockConfigPath = path.resolve(
  __dirname,
  "pi-extensions/my-permission/config.json",
);

let mockConfig: unknown = {};
let mockJudge: ReturnType<typeof createMockJudge>;
let childSession = false;
let mockConfirm = vi.fn().mockResolvedValue(true);
let toolCallHandler: ((event: unknown, ctx: unknown) => Promise<unknown | undefined>) | null = null;

function createMockJudge() {
  return vi.fn().mockResolvedValue({
    safe: true,
    reason: "looks safe",
    toolFor: "do something",
  });
}

mockJudge = createMockJudge();

vi.mock("./config", () => ({
  loadConfig: vi.fn(async () => mockConfig),
}));

vi.mock("./judge", () => ({
  createJudge: vi.fn(() => mockJudge),
}));

vi.mock("./ui", () => ({
  isChildSession: vi.fn(() => childSession),
  createSessionCache: vi.fn(() => ({
    approve: vi.fn(),
    isApproved: vi.fn().mockReturnValue(false),
  })),
  confirmToolCall: vi.fn((_ctx, _name, _toolFor, _reason) => mockConfirm()),
}));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(() => mockConfigPath),
}));

vi.mock("@earendil-works/pi-coding-agent", () => {
  const MockModelRuntime = {
    create: vi.fn().mockResolvedValue({
      complete: vi.fn(),
      getModel: vi.fn().mockReturnValue(undefined),
    }),
  };

  return {
    ModelRuntime: MockModelRuntime,
  };
});

// ── Import the extension factory AFTER mocks are in place ──

let myPermission: (pi: unknown) => Promise<void>;
beforeEach(async () => {
  vi.resetModules();
  // Reset mock state
  mockConfig = {
    defaultPolicy: "ask",
    judgeModel: "deepseek/deepseek-v4-flash",
    judgeTimeoutMs: 5000,
    childPolicy: "deny-on-unsafe",
    permission: {},
  };
  childSession = false;
  mockConfirm = vi.fn().mockResolvedValue(true);
  toolCallHandler = null;
  mockJudge = createMockJudge();

  const mod = await import("./index");
  myPermission = mod.default;
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeApi(): unknown {
  return {
    on: vi.fn((_event: string, h: unknown) => {
      toolCallHandler = h as (
        event: unknown,
        ctx: unknown,
      ) => Promise<unknown | undefined>;
    }),
  };
}

function makeCtx(hasUI = true): unknown {
  return {
    hasUI,
    cwd: "/repo",
    ui: { confirm: mockConfirm },
    modelRegistry: { find: vi.fn() },
    model: undefined,
  };
}

function makeBashEvent(command: string): unknown {
  return {
    toolName: "bash",
    toolCallId: "t1",
    input: { command },
  };
}

function makeReadEvent(filePath: string): unknown {
  return {
    toolName: "read",
    toolCallId: "t2",
    input: { path: filePath },
  };
}

function makeGrepEvent(filePath: string): unknown {
  return {
    toolName: "grep",
    toolCallId: "t3",
    input: { pattern: "SECRET", path: filePath },
  };
}

// ── Tests ──

describe("my-permission extension", () => {
  it("allows when rule says allow", async () => {
    mockConfig = {
      ...mockConfig,
      permission: { read: "allow", bash: "allow" },
    };
    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      { ...makeReadEvent("src/main.ts"), type: "tool_call" },
      makeCtx(),
    );
    expect(result).toBeUndefined();
  });

  it("blocks when rule says deny", async () => {
    mockConfig = {
      ...mockConfig,
      permission: { path: { "*.env": "deny" }, read: "allow" },
    };
    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      { ...makeReadEvent(".env"), type: "tool_call" },
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: expect.any(String) });
    expect(mockJudge).not.toHaveBeenCalled();
  });

  it("passes through when judge returns safe", async () => {
    mockJudge.mockResolvedValue({
      safe: true,
      reason: "read-only file",
      toolFor: "reads a file",
    });

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeReadEvent("src/main.ts"),
        type: "tool_call",
        toolName: "otherTool",
      } as unknown,
      makeCtx(),
    );
    expect(result).toBeUndefined();
    expect(mockJudge).toHaveBeenCalled();
  });

  it("blocks in child session when judge says unsafe", async () => {
    childSession = true;
    mockJudge.mockResolvedValue({
      safe: false,
      reason: "writes outside project",
      toolFor: "writes a file",
    });

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeReadEvent("../outside.txt"),
        type: "tool_call",
        toolName: "write",
      } as unknown,
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: "writes outside project" });
  });

  it("confirms with user in parent session when judge says unsafe", async () => {
    mockJudge.mockResolvedValue({
      safe: false,
      reason: "bash rm command",
      toolFor: "removes a file",
    });
    mockConfirm.mockResolvedValue(true);

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeBashEvent("rm -rf tmp"),
        type: "tool_call",
        toolName: "bash",
      } as unknown,
      makeCtx(),
    );
    expect(result).toBeUndefined();
  });

  it("blocks when user denies confirmation", async () => {
    mockJudge.mockResolvedValue({
      safe: false,
      reason: "dangerous command",
      toolFor: "removes files",
    });
    mockConfirm.mockResolvedValue(false);

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeBashEvent("sudo rm -rf /"),
        type: "tool_call",
        toolName: "bash",
      } as unknown,
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: "dangerous command" });
  });

  it("blocks in no-UI parent session when judge says unsafe", async () => {
    mockJudge.mockResolvedValue({
      safe: false,
      reason: "writes file",
      toolFor: "writes a file",
    });

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeReadEvent("src/main.ts"),
        type: "tool_call",
        toolName: "write",
      } as unknown,
      makeCtx(false),
    );
    // no-UI + judge unsafe → deny
    expect(result).toEqual({
      block: true,
      reason: "writes file",
    });
  });

  it("denies path-layer sensitive files even when tool surface allows", async () => {
    mockConfig = {
      ...mockConfig,
      permission: { path: { "*.env": "deny" }, read: "allow" },
    };

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      { ...makeReadEvent(".env"), type: "tool_call" },
      makeCtx(),
    );
    expect(result).toEqual({ block: true, reason: expect.any(String) });
  });

  it("extracts paths from grep tool and applies path layer deny", async () => {
    mockConfig = {
      ...mockConfig,
      permission: { grep: "allow", path: { "*.env": "deny" } },
    };

    const api = makeApi();
    await myPermission(api);

    const result = await toolCallHandler!(
      {
        ...makeGrepEvent(".env"),
        type: "tool_call",
        toolName: "grep",
      },
      makeCtx(),
    );
    // path deny should win over grep allow
    expect(result).toEqual({ block: true, reason: expect.any(String) });
  });
});
