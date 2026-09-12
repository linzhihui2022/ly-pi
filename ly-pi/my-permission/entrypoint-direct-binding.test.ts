import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./rules", () => ({
  decide: vi.fn(() => ({ action: "ask" })),
}));
vi.mock("./stats", () => ({
  collectAllowed: vi.fn(() => []),
  collectDeniedThenApproved: vi.fn(() => []),
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
import myPermission from "./index";
import { collectDeniedThenApproved } from "./stats";

function makeModel(provider: string, id: string): Model<Api> {
  return {
    id,
    provider,
    name: id,
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: true,
  } as Model<Api>;
}

type Handler = (...args: any[]) => any;

type MockApi = ReturnType<typeof createMockApi>;

function createMockApi() {
  const handlers = new Map<string, Handler>();
  const tools = new Map<string, { execute: Handler }>();
  return {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    registerCommand: vi.fn(),
    registerTool: vi.fn((tool: { name: string; execute: Handler }) => {
      tools.set(tool.name, tool);
    }),
    getHandler: (event: string) => handlers.get(event),
    getTool: (name: string) => tools.get(name),
  };
}

function createContext(
  find: ReturnType<typeof vi.fn>,
  complete: ReturnType<typeof vi.fn>,
  overrides: Record<string, unknown> = {},
) {
  return {
    cwd: "/repo",
    hasUI: true,
    modelRegistry: { find, complete },
    sessionManager: {
      getEntries: () => [],
      getSessionId: () => "session-xyz",
    },
    ui: {
      confirm: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
    },
    ...overrides,
  } as unknown as ExtensionContext;
}

async function loadExtension(api: MockApi) {
  await myPermission(api as unknown as ExtensionAPI);
}

const deniedThenApprovedCase = {
  toolName: "bash",
  value: "git status",
  judgeReason: "误判为危险操作",
  context: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("direct model bindings through the extension entrypoint", () => {
  it("routes Judge through modelRegistry with the configured model", async () => {
    const model = makeModel("deepseek", "deepseek-flash");
    const find = vi.fn(() => model);
    const complete = vi.fn().mockResolvedValue({
      stopReason: "stop",
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"safe","toolFor":"bash git status"}',
        },
      ],
    });
    const api = createMockApi();
    await loadExtension(api);

    const result = await api.getHandler("tool_call")?.(
      { toolName: "bash", input: { command: "git status" } },
      createContext(find, complete),
    );

    expect(result).toBeUndefined();
    expect(find).toHaveBeenCalledWith("deepseek", "deepseek-flash");
    expect(complete).toHaveBeenCalledWith(
      model,
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(complete.mock.calls[0]?.[2]).not.toHaveProperty("reasoningEffort");
  });

  it("routes Audit through modelRegistry with max reasoning effort", async () => {
    vi.mocked(collectDeniedThenApproved).mockReturnValue([
      deniedThenApprovedCase,
    ]);
    const model = makeModel("openai-codex", "gpt-6-astra");
    const find = vi.fn(() => model);
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: "stop",
        content: [
          {
            type: "text",
            text: '{"add":[{"rule":"允许 git status","reason":"安全的只读操作"}],"remove":[]}',
          },
        ],
      })
      .mockResolvedValueOnce({
        stopReason: "stop",
        content: [{ type: "text", text: "允许 git status" }],
      });
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      ?.execute(
        "call",
        {},
        undefined,
        undefined,
        createContext(find, complete),
      );

    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条规则" }],
    });
    expect(find).toHaveBeenNthCalledWith(1, "openai-codex", "gpt-6-astra");
    expect(find).toHaveBeenNthCalledWith(2, "openai-codex", "gpt-6-astra");
    expect(complete).toHaveBeenNthCalledWith(1, model, expect.any(Object), {
      reasoningEffort: "max",
    });
    expect(complete).toHaveBeenNthCalledWith(2, model, expect.any(Object), {
      reasoningEffort: "max",
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("JUDGE.md"),
      "允许 git status",
      "utf-8",
    );
  });

  it("keeps Audit unavailable fail closed without writing JUDGE.md", async () => {
    vi.mocked(collectDeniedThenApproved).mockReturnValue([
      deniedThenApprovedCase,
    ]);
    const find = vi.fn(() => undefined);
    const complete = vi.fn();
    const api = createMockApi();
    await loadExtension(api);

    const result = await api
      .getTool("permission_advocate")
      ?.execute(
        "call",
        {},
        undefined,
        undefined,
        createContext(find, complete),
      );

    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: expect.stringContaining("未找到可用的审计模型"),
        },
      ],
    });
    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-6-astra");
    expect(complete).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
