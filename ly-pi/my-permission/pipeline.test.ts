import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { AnalyzerConfig, AnalyzerFn, MergerInput } from "./pipeline";
import { createMerger, createRoleAnalyzer } from "./pipeline";
import type { ChiefSuggestionItem } from "./chief";
import type { Config } from "./types";

vi.mock("@earendil-works/pi-ai", () => ({
  complete: vi.fn(),
}));

function makeModel(
  overrides: Partial<{ id: string; provider: string }> = {},
): Model<Api> {
  return {
    id: overrides.id ?? "deepseek-v4-pro",
    provider: overrides.provider ?? "deepseek",
    name: "Test Model",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  } as Model<Api>;
}

const config: Config = {
  defaultPolicy: "ask",
  judgeModel: "deepseek/deepseek-v4-flash",
  professorModel: "deepseek/deepseek-v4-pro",
  professorThinking: "max",
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const resolveModelOk = vi.fn(() => makeModel());
const resolveModelNotFound = vi.fn(() => undefined);
const getAuthOk = vi.fn(async () => ({ apiKey: "test-key" }));

async function mockComplete(value: unknown): Promise<void> {
  const { complete } = await import("@earendil-works/pi-ai");
  (complete as ReturnType<typeof vi.fn>).mockResolvedValue(value);
}

// ---- createRoleAnalyzer ----

interface TestResult {
  suggestions: Array<{ rule: string; reason: string }>;
  summary: string;
}

function makeAnalyzerConfig(
  overrides: Partial<AnalyzerConfig<string[], TestResult>> = {},
): AnalyzerConfig<string[], TestResult> {
  return {
    systemPrompt: "test system prompt",
    buildUserPrompt: (input, _cwd, _judgeMd, _judgePrompt) =>
      `input: ${JSON.stringify(input)}`,
    parseResult: (text: string) => {
      try {
        const p = JSON.parse(text) as TestResult;
        if (p.suggestions && p.summary) return p;
        return undefined;
      } catch {
        return undefined;
      }
    },
    emptyInputError: "没有输入数据",
    modelLabel: "test-analyzer",
    ...overrides,
  };
}

describe("createRoleAnalyzer", () => {
  it("returns error when input is empty", async () => {
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      [],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toBe("没有输入数据");
    expect(result.result).toBeUndefined();
  });

  it("returns error when model format is invalid", async () => {
    const badConfig = { ...config, professorModel: "invalid" };
    const analyzer = createRoleAnalyzer(badConfig, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model not found", async () => {
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelNotFound,
      getAuthOk,
    );
    expect(result.error).toContain("未找到 test-analyzer 模型");
  });

  it("returns parsed result on successful LLM call", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [{ rule: "r1", reason: "reason" }],
            summary: "found 1 issue",
          }),
        },
      ],
    });

    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item1"],
      "/repo",
      "current md",
      "judge prompt",
      resolveModelOk,
      getAuthOk,
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      suggestions: [{ rule: "r1", reason: "reason" }],
      summary: "found 1 issue",
    });
    expect(result.cost).toBeUndefined();
  });

  it("passes buildUserPrompt output to LLM", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify({ suggestions: [], summary: "ok" }),
            },
          ],
        });
      },
    );

    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig({
        buildUserPrompt: (input, cwd, judgeMd, judgePrompt) =>
          `cases:${input.length} cwd:${cwd} md:${judgeMd} jp:${judgePrompt}`,
      }),
    );
    await analyzer(
      ["a", "b"],
      "/my-project",
      "line1\nline2",
      "JUDGE_PROMPT_TEXT",
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(ctx.systemPrompt).toBe("test system prompt");
    expect(ctx.messages[0].content).toContain("cases:2");
    expect(ctx.messages[0].content).toContain("cwd:/my-project");
    expect(ctx.messages[0].content).toContain("md:line1");
    expect(ctx.messages[0].content).toContain("jp:JUDGE_PROMPT_TEXT");
  });

  it("returns error on invalid JSON response", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("无法解析");
  });

  it("returns error on empty response content", async () => {
    await mockComplete({ content: [] });
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("空内容");
  });

  it("returns error when LLM call throws", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error"),
    );
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("调用失败");
  });

  it("handles API error responses", async () => {
    await mockComplete({
      content: [],
      stopReason: "error",
      errorMessage: "rate limit exceeded",
    });
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("rate limit exceeded");
  });

  it("captures cost from response usage", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
      usage: { cost: { total: 0.005 } },
    });
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.cost).toBe(0.005);
  });

  it("extracts text from non-text content types", async () => {
    await mockComplete({
      content: [
        {
          type: "reasoning",
          text: JSON.stringify({
            suggestions: [{ rule: "r", reason: "reason" }],
            summary: "ok",
          }),
        },
      ],
    });
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    const result = await analyzer(
      ["item"],
      "/repo",
      "",
      "",
      resolveModelOk,
      getAuthOk,
    );
    expect(result.result).toBeDefined();
    expect(result.result?.suggestions).toHaveLength(1);
  });

  it("calls getAuth for the resolved model", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });

    const getAuth = vi.fn(async () => ({ apiKey: "my-key" }));
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    await analyzer(["item"], "/repo", "", "", resolveModelOk, getAuth);

    expect(getAuth).toHaveBeenCalledTimes(1);
    const calledModel = getAuth.mock.calls[0][0] as Model<Api>;
    expect(calledModel.id).toBe("deepseek-v4-pro");
  });

  it("passes thinking and auth options to complete()", async () => {
    let capturedOpts: Record<string, unknown> = {};
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, _context: unknown, opts: Record<string, unknown>) => {
        capturedOpts = opts;
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify({ suggestions: [], summary: "ok" }),
            },
          ],
        });
      },
    );

    const thinkingConfig = { ...config, professorThinking: "low" };
    const analyzer = createRoleAnalyzer(
      thinkingConfig,
      makeAnalyzerConfig({ thinking: "low" }),
    );
    const getAuth = vi.fn(async () => ({
      apiKey: "key",
      headers: { "X-Custom": "val" },
      env: { FOO: "bar" },
    }));
    await analyzer(["item"], "/repo", "", "", resolveModelOk, getAuth);

    expect(capturedOpts.thinking).toBe("low");
    expect(capturedOpts.apiKey).toBe("key");
    expect(capturedOpts.headers).toEqual({ "X-Custom": "val" });
    expect(capturedOpts.env).toEqual({ FOO: "bar" });
  });

  it("uses config.professorThinking as default when roleConfig has no thinking", async () => {
    let capturedOpts: Record<string, unknown> = {};
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, _context: unknown, opts: Record<string, unknown>) => {
        capturedOpts = opts;
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify({ suggestions: [], summary: "ok" }),
            },
          ],
        });
      },
    );

    // config.professorThinking is "max", roleConfig has no thinking override
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig());
    await analyzer(["item"], "/repo", "", "", resolveModelOk, getAuthOk);

    expect(capturedOpts.thinking).toBe("max");
  });

  it("roleConfig.thinking overrides config.professorThinking", async () => {
    let capturedOpts: Record<string, unknown> = {};
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, _context: unknown, opts: Record<string, unknown>) => {
        capturedOpts = opts;
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: JSON.stringify({ suggestions: [], summary: "ok" }),
            },
          ],
        });
      },
    );

    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig({ thinking: "off" }),
    );
    await analyzer(["item"], "/repo", "", "", resolveModelOk, getAuthOk);

    expect(capturedOpts.thinking).toBe("off");
  });
});

// ---- createMerger ----

describe("createMerger", () => {
  it("returns error when model format is invalid", async () => {
    const badConfig = { ...config, professorModel: "invalid" };
    const merger = createMerger(badConfig);
    const result = await merger(
      { current: "规则1", operations: ["新规则"] },
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model not found", async () => {
    const merger = createMerger(config);
    const result = await merger(
      { current: "规则1", operations: ["新规则"] },
      resolveModelNotFound,
      getAuthOk,
    );
    expect(result.error).toContain("未找到合并模型");
  });

  it("merges string[] operations (advocate/prosecutor path)", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [{ type: "text", text: "规则1\n规则2\n新增规则" }],
        });
      },
    );

    const merger = createMerger(config);
    const result = await merger(
      { current: "规则1\n规则2", operations: ["新增规则"] },
      resolveModelOk,
      getAuthOk,
    );

    expect(result.error).toBeUndefined();
    expect(result.mergedText).toBe("规则1\n规则2\n新增规则");

    const ctx = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(ctx.systemPrompt).toContain("将用户选中的新规则融合");
    expect(ctx.messages[0].content).toContain("规则1");
    expect(ctx.messages[0].content).toContain("新增规则");
  });

  it("merges ChiefSuggestionItem[] operations (chief path)", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [{ type: "text", text: "规则A改\n规则B" }],
        });
      },
    );

    const suggestions: ChiefSuggestionItem[] = [
      { type: "add", rule: "新规则X", reason: "遗漏" },
      { type: "modify", oldRule: "规则A", newRule: "规则A改", reason: "过窄" },
      {
        type: "merge",
        oldRules: ["规则B", "规则C"],
        newRule: "规则BC",
        reason: "可合并",
      },
    ];

    const merger = createMerger(config);
    const result = await merger(
      { current: "规则A\n规则B\n规则C", operations: suggestions },
      resolveModelOk,
      getAuthOk,
    );

    expect(result.error).toBeUndefined();
    expect(result.mergedText).toBe("规则A改\n规则B");

    const ctx = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(ctx.systemPrompt).toContain("将审判长的建议应用");
    expect(ctx.messages[0].content).toContain("[新增] 新规则X");
    expect(ctx.messages[0].content).toContain('[改写] "规则A" → "规则A改"');
    expect(ctx.messages[0].content).toContain(
      '[合并] "规则B" + "规则C" → "规则BC"',
    );
  });

  it("auto-detects chief path when any ChiefSuggestionItem is present", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [{ type: "text", text: "merged" }],
        });
      },
    );

    const merger = createMerger(config);
    await merger(
      {
        current: "rule",
        operations: [{ type: "add", rule: "x", reason: "r" }],
      },
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { systemPrompt: string };
    expect(ctx.systemPrompt).toContain("审判长");
  });

  it("returns error on empty response", async () => {
    await mockComplete({ content: [] });
    const merger = createMerger(config);
    const result = await merger(
      { current: "规则1", operations: ["新规则"] },
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("空内容");
  });

  it("returns error when LLM call throws", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("timeout"),
    );
    const merger = createMerger(config);
    const result = await merger(
      { current: "规则1", operations: ["新规则"] },
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("调用失败");
  });

  it("formats remove and unknown operation types in chief path", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [{ type: "text", text: "merged" }],
        });
      },
    );

    const suggestions: ChiefSuggestionItem[] = [
      { type: "remove", rule: "要删除的规则", reason: "过时" },
      { type: "unknown_type" } as unknown as ChiefSuggestionItem,
    ];

    const merger = createMerger(config);
    await merger(
      { current: "规则1", operations: suggestions },
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("[删除] 要删除的规则");
    expect(msg).toContain("[未知]");
  });

  it("captures cost from merge response", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: "merged" }],
      usage: { cost: { total: 0.003 } },
    });
    const merger = createMerger(config);
    const result = await merger(
      { current: "规则1", operations: ["新规则"] },
      resolveModelOk,
      getAuthOk,
    );
    expect(result.cost).toBe(0.003);
    expect(result.mergedText).toBe("merged");
  });
});
