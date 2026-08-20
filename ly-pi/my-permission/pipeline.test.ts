import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChiefSuggestionItem } from "./chief";
import type { AnalyzerConfig } from "./pipeline";
import { createMerger, createRoleAnalyzer } from "./pipeline";
import type { Config, ModelClient } from "./types";

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
const completeModel = vi.fn<ModelClient["complete"]>();
const modelClient: ModelClient = {
  find: resolveModelOk,
  complete: completeModel,
};

beforeEach(() => {
  completeModel.mockReset();
  resolveModelOk.mockClear();
  resolveModelNotFound.mockClear();
});

async function mockComplete(value: unknown): Promise<void> {
  completeModel.mockResolvedValue(value as never);
}

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
        const parsed = JSON.parse(text) as TestResult;
        return parsed.suggestions && parsed.summary ? parsed : undefined;
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
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer([], "/repo", "", "");
    expect(result.error).toBe("没有输入数据");
    expect(result.result).toBeUndefined();
  });

  it("returns error when model format is invalid", async () => {
    const badConfig = { ...config, professorModel: "invalid" };
    const analyzer = createRoleAnalyzer(
      badConfig,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model is unavailable", async () => {
    const analyzer = createRoleAnalyzer(config, makeAnalyzerConfig(), {
      ...modelClient,
      find: resolveModelNotFound,
    });
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("未找到 test-analyzer 模型");
  });

  it("returns parsed result on successful model call", async () => {
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

    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(
      ["item1"],
      "/repo",
      "current md",
      "judge prompt",
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      suggestions: [{ rule: "r1", reason: "reason" }],
      summary: "found 1 issue",
    });
    expect(result.cost).toBeUndefined();
  });

  it("passes buildUserPrompt output to the model", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [
          {
            type: "text",
            text: JSON.stringify({ suggestions: [], summary: "ok" }),
          },
        ],
      } as never);
    });

    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig({
        buildUserPrompt: (input, cwd, judgeMd, judgePrompt) =>
          `cases:${input.length} cwd:${cwd} md:${judgeMd} jp:${judgePrompt}`,
      }),
      modelClient,
    );
    await analyzer(
      ["a", "b"],
      "/my-project",
      "line1\nline2",
      "JUDGE_PROMPT_TEXT",
    );

    const context = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(context.systemPrompt).toBe("test system prompt");
    expect(context.messages[0].content).toContain("cases:2");
    expect(context.messages[0].content).toContain("cwd:/my-project");
    expect(context.messages[0].content).toContain("md:line1");
    expect(context.messages[0].content).toContain("jp:JUDGE_PROMPT_TEXT");
  });

  it("returns error on invalid JSON response", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("无法解析");
  });

  it("returns error on empty response content", async () => {
    await mockComplete({ content: [] });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("空内容");
  });

  it("returns error when the model call throws", async () => {
    completeModel.mockRejectedValue(new Error("network error"));
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("调用失败");
  });

  it("handles model error responses", async () => {
    await mockComplete({
      content: [],
      stopReason: "error",
      errorMessage: "rate limit exceeded",
    });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.error).toContain("rate limit exceeded");
  });

  it("captures cost from response usage", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
      usage: { cost: { total: 0.005 } },
    });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
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
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    const result = await analyzer(["item"], "/repo", "", "");
    expect(result.result?.suggestions).toHaveLength(1);
  });

  it("maps config.professorThinking to reasoningEffort", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig(),
      modelClient,
    );
    await analyzer(["item"], "/repo", "", "");

    const options = completeModel.mock.calls.at(-1)?.[2] as {
      reasoningEffort?: string;
    };
    expect(options.reasoningEffort).toBe("max");
  });

  it("omits reasoningEffort when roleConfig disables thinking", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });
    const analyzer = createRoleAnalyzer(
      config,
      makeAnalyzerConfig({ thinking: "off" }),
      modelClient,
    );
    await analyzer(["item"], "/repo", "", "");

    const options = completeModel.mock.calls.at(-1)?.[2] as {
      reasoningEffort?: string;
    };
    expect(options.reasoningEffort).toBeUndefined();
  });
});

describe("createMerger", () => {
  it("returns error when model format is invalid", async () => {
    const badConfig = { ...config, professorModel: "invalid" };
    const merger = createMerger(badConfig, modelClient);
    const result = await merger({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model is unavailable", async () => {
    const merger = createMerger(config, {
      ...modelClient,
      find: resolveModelNotFound,
    });
    const result = await merger({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.error).toContain("未找到合并模型");
  });

  it("merges string operations", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "规则1\n规则2\n新增规则" }],
      } as never);
    });

    const merger = createMerger(config, modelClient);
    const result = await merger({
      current: "规则1\n规则2",
      operations: ["新增规则"],
    });

    expect(result.error).toBeUndefined();
    expect(result.mergedText).toBe("规则1\n规则2\n新增规则");

    const context = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(context.systemPrompt).toContain("将用户选中的新规则融合");
    expect(context.messages[0].content).toContain("规则1");
    expect(context.messages[0].content).toContain("新增规则");
  });

  it("merges chief suggestion operations", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "规则A改\n规则B" }],
      } as never);
    });

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

    const merger = createMerger(config, modelClient);
    const result = await merger({
      current: "规则A\n规则B\n规则C",
      operations: suggestions,
    });

    expect(result.error).toBeUndefined();
    expect(result.mergedText).toBe("规则A改\n规则B");

    const context = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(context.systemPrompt).toContain("将审判长的建议应用");
    expect(context.messages[0].content).toContain("[新增] 新规则X");
    expect(context.messages[0].content).toContain('[改写] "规则A" → "规则A改"');
    expect(context.messages[0].content).toContain(
      '[合并] "规则B" + "规则C" → "规则BC"',
    );
  });

  it("auto-detects the chief path", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "merged" }],
      } as never);
    });

    const merger = createMerger(config, modelClient);
    await merger({
      current: "rule",
      operations: [{ type: "add", rule: "x", reason: "r" }],
    });

    const context = capturedContext as { systemPrompt: string };
    expect(context.systemPrompt).toContain("审判长");
  });

  it("returns error on empty response", async () => {
    await mockComplete({ content: [] });
    const merger = createMerger(config, modelClient);
    const result = await merger({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.error).toContain("空内容");
  });

  it("returns error when the model call throws", async () => {
    completeModel.mockRejectedValue(new Error("timeout"));
    const merger = createMerger(config, modelClient);
    const result = await merger({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.error).toContain("调用失败");
  });

  it("formats remove and unknown chief operation types", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "merged" }],
      } as never);
    });

    const suggestions: ChiefSuggestionItem[] = [
      { type: "remove", rule: "要删除的规则", reason: "过时" },
      { type: "unknown_type" } as unknown as ChiefSuggestionItem,
    ];

    const merger = createMerger(config, modelClient);
    await merger({ current: "规则1", operations: suggestions });

    const context = capturedContext as {
      messages: Array<{ content: string }>;
    };
    const message = context.messages[0].content;
    expect(message).toContain("[删除] 要删除的规则");
    expect(message).toContain("[未知]");
  });

  it("captures cost from merge response", async () => {
    await mockComplete({
      content: [{ type: "text", text: "merged" }],
      usage: { cost: { total: 0.003 } },
    });
    const merger = createMerger(config, modelClient);
    const result = await merger({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.cost).toBe(0.003);
    expect(result.mergedText).toBe("merged");
  });
});
