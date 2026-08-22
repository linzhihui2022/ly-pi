import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChiefSuggestionItem } from "./chief";
import type { AnalyzerConfig } from "./pipeline";
import { createMerger, createRoleAnalyzer } from "./pipeline";
import type { ModelClient } from "./types";

function makeModel(
  overrides: Partial<{ id: string; provider: string }> = {},
): Model<Api> {
  return {
    id: overrides.id ?? "audit-model",
    provider: overrides.provider ?? "test",
    name: "Test Model",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  } as Model<Api>;
}

const resolveModelOk = vi.fn(() => makeModel());
const completeModel = vi.fn<ModelClient["complete"]>();
const modelClient: ModelClient = {
  find: resolveModelOk,
  complete: completeModel,
};

beforeEach(() => {
  completeModel.mockReset();
  resolveModelOk.mockClear();
});

async function mockComplete(value: unknown): Promise<void> {
  completeModel.mockResolvedValue(value as never);
}

interface TestResult {
  suggestions: Array<{ rule: string; reason: string }>;
  summary: string;
}

function createSuccessfulSecurityAuditRunner(thinking: "off" | "max") {
  const candidate = {
    slot: "primary",
    model: "security/audit",
    label: "Security audit",
    thinking,
    source: "manifest" as const,
  };
  const run = vi.fn(
    async (
      _role: string,
      _models: ModelClient,
      operation: (
        model: Model<Api>,
        resolvedCandidate: typeof candidate,
      ) => Promise<unknown>,
    ) => ({
      status: "success" as const,
      value: await operation(makeModel(), candidate),
      candidate,
    }),
  );
  return { modelRunner: { run } as never, run };
}

function createFailedSecurityAuditRunner(
  reason: string,
  failurePolicy: "error-no-write" | "skip" = "error-no-write",
) {
  const run = vi.fn(async () => ({
    status: "failure" as const,
    failurePolicy,
    reason,
  }));
  return { modelRunner: { run } as never, run };
}

const defaultSecurityAuditRunner = createSuccessfulSecurityAuditRunner("max");

beforeEach(() => {
  defaultSecurityAuditRunner.run.mockClear();
});

function createTestAnalyzer(
  roleConfig = makeAnalyzerConfig(),
  modelClientOverride = modelClient,
  modelRunner = defaultSecurityAuditRunner.modelRunner,
) {
  return createRoleAnalyzer(roleConfig, modelClientOverride, modelRunner);
}

function createTestMerger(
  modelClientOverride = modelClient,
  modelRunner = defaultSecurityAuditRunner.modelRunner,
) {
  return createMerger(modelClientOverride, modelRunner);
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
    const analyzer = createTestAnalyzer();
    const result = await analyzer([], "/repo", "", "");
    expect(result.error).toBe("没有输入数据");
    expect(result.result).toBeUndefined();
  });

  it("returns a clear error when security-audit candidates are unavailable", async () => {
    const { modelRunner, run } = createFailedSecurityAuditRunner(
      "no usable candidate for role 'security-audit'",
    );
    const analyzer = createTestAnalyzer(
      makeAnalyzerConfig(),
      modelClient,
      modelRunner,
    );

    const result = await analyzer(["item"], "/repo", "", "");

    expect(run).toHaveBeenCalledWith(
      "security-audit",
      modelClient,
      expect.any(Function),
    );
    expect(result.error).toContain("no usable candidate");
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("reports an unexpected security-audit failure policy", async () => {
    const { modelRunner } = createFailedSecurityAuditRunner(
      "no usable candidate",
      "skip",
    );
    const result = await createTestAnalyzer(
      makeAnalyzerConfig(),
      modelClient,
      modelRunner,
    )(["item"], "/repo", "", "");

    expect(result.error).toBe(
      "test-analyzer 模型策略配置错误：security-audit 需要 error-no-write，实际为 skip",
    );
  });

  it("uses security-audit Model Runner and its candidate thinking", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });
    const { modelRunner, run } = createSuccessfulSecurityAuditRunner("off");
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      modelClient,
      modelRunner,
    );

    await analyzer(["item"], "/repo", "", "");

    expect(run).toHaveBeenCalledWith(
      "security-audit",
      modelClient,
      expect.any(Function),
    );
    expect(completeModel.mock.calls.at(-1)?.[2]).toEqual({});
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

    const analyzer = createTestAnalyzer();
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

    const analyzer = createTestAnalyzer(
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
    const result = await createTestAnalyzer()(["item"], "/repo", "", "");
    expect(result.error).toContain("无法解析");
  });

  it("returns error on empty response content", async () => {
    await mockComplete({ content: [] });
    const result = await createTestAnalyzer()(["item"], "/repo", "", "");
    expect(result.error).toContain("空内容");
  });

  it("returns error when the model call throws", async () => {
    completeModel.mockRejectedValue(new Error("network error"));
    const result = await createTestAnalyzer()(["item"], "/repo", "", "");
    expect(result.error).toContain("调用失败");
  });

  it("surfaces security-audit API failures", async () => {
    const { modelRunner } = createFailedSecurityAuditRunner(
      "rate limit exceeded",
    );
    const result = await createTestAnalyzer(
      makeAnalyzerConfig(),
      modelClient,
      modelRunner,
    )(["item"], "/repo", "", "");
    expect(result.error).toContain("rate limit exceeded");
  });

  it("captures cost and the selected security-audit model", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
      usage: { cost: { total: 0.005 } },
    });
    const result = await createTestAnalyzer()(["item"], "/repo", "", "");
    expect(result.cost).toBe(0.005);
    expect(result.modelUsed).toBe("security/audit");
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
    const result = await createTestAnalyzer()(["item"], "/repo", "", "");
    expect(result.result?.suggestions).toHaveLength(1);
  });

  it("uses the selected security-audit candidate thinking", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });
    await createTestAnalyzer()(["item"], "/repo", "", "");

    expect(completeModel.mock.calls.at(-1)?.[2]).toEqual({
      reasoningEffort: "max",
    });
  });
});

describe("createMerger", () => {
  it("returns a clear error without calling a model when security-audit fails", async () => {
    const { modelRunner, run } = createFailedSecurityAuditRunner(
      "no usable candidate for role 'security-audit'",
    );
    const result = await createTestMerger(
      modelClient,
      modelRunner,
    )({
      current: "规则1",
      operations: ["新规则"],
    });

    expect(run).toHaveBeenCalledWith(
      "security-audit",
      modelClient,
      expect.any(Function),
    );
    expect(result.error).toContain("no usable candidate");
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("reports an unexpected security-audit failure policy", async () => {
    const { modelRunner } = createFailedSecurityAuditRunner(
      "no usable candidate",
      "skip",
    );
    const result = await createTestMerger(
      modelClient,
      modelRunner,
    )({
      current: "规则1",
      operations: ["新规则"],
    });

    expect(result.error).toBe(
      "合并模型策略错误：security-audit 需要 error-no-write，实际为 skip",
    );
  });

  it("uses the selected security-audit candidate thinking", async () => {
    await mockComplete({ content: [{ type: "text", text: "merged" }] });
    const { modelRunner } = createSuccessfulSecurityAuditRunner("off");
    const result = await createTestMerger(
      modelClient,
      modelRunner,
    )({
      current: "规则1",
      operations: ["新规则"],
    });

    expect(result.mergedText).toBe("merged");
    expect(completeModel.mock.calls.at(-1)?.[2]).toEqual({});
  });

  it("merges string operations", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "规则1\n规则2\n新增规则" }],
      } as never);
    });

    const result = await createTestMerger()({
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

    const result = await createTestMerger()({
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

  it("returns error on empty response", async () => {
    await mockComplete({ content: [] });
    const result = await createTestMerger()({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.error).toContain("空内容");
  });

  it("returns error when the model call throws", async () => {
    completeModel.mockRejectedValue(new Error("timeout"));
    const result = await createTestMerger()({
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

    await createTestMerger()({ current: "规则1", operations: suggestions });

    const context = capturedContext as {
      messages: Array<{ content: string }>;
    };
    const message = context.messages[0].content;
    expect(message).toContain("[删除] 要删除的规则");
    expect(message).toContain("[未知]");
  });

  it("captures cost and the selected security-audit model", async () => {
    await mockComplete({
      content: [{ type: "text", text: "merged" }],
      usage: { cost: { total: 0.003 } },
    });
    const result = await createTestMerger()({
      current: "规则1",
      operations: ["新规则"],
    });
    expect(result.cost).toBe(0.003);
    expect(result.modelUsed).toBe("security/audit");
    expect(result.mergedText).toBe("merged");
  });
});
