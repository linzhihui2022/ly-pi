import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { ChiefSuggestionItem } from "./chief";
import type { DirectModelBinding } from "./direct-model";
import type { AnalyzerConfig } from "./pipeline";
import { createMerger, createRoleAnalyzer } from "./pipeline";
import type { ModelClient } from "./types";

function makeModel(provider = "openai-codex", id = "gpt-5.6-sol"): Model<Api> {
  return {
    id,
    provider,
    name: "Sol",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: true,
  } as Model<Api>;
}

const auditBinding: DirectModelBinding = {
  model: "openai-codex/gpt-5.6-sol",
  thinking: "high",
};

function createClient(model = makeModel()) {
  const find = vi.fn(() => model);
  const complete = vi.fn<ModelClient["complete"]>();
  return { client: { find, complete } as ModelClient, find, complete };
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

function successfulAuditResponse(
  text = JSON.stringify({ suggestions: [], summary: "ok" }),
  overrides: Record<string, unknown> = {},
) {
  return {
    stopReason: "stop",
    content: [{ type: "text", text }],
    ...overrides,
  };
}

describe("createRoleAnalyzer", () => {
  it("returns the empty-input error without resolving a model", async () => {
    const { client, find } = createClient();
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      client,
      auditBinding,
    );

    await expect(analyzer([], "/repo", "", "")).resolves.toEqual({
      error: "没有输入数据",
    });
    expect(find).not.toHaveBeenCalled();
  });

  it("uses the configured Sol Direct Model Binding with high thinking", async () => {
    const sol = makeModel();
    const { client, find, complete } = createClient(sol);
    complete.mockResolvedValue(successfulAuditResponse() as never);
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      client,
      auditBinding,
    );

    await expect(analyzer(["item"], "/repo", "", "")).resolves.toMatchObject({
      result: { suggestions: [], summary: "ok" },
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-sol");
    expect(complete).toHaveBeenCalledWith(sol, expect.any(Object), {
      reasoningEffort: "high",
    });
  });

  it("returns a no-write error when the Sol binding is unavailable", async () => {
    const { client, complete } = createClient();
    client.find = vi.fn(() => undefined);
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      client,
      auditBinding,
    );

    await expect(analyzer(["item"], "/repo", "", "")).resolves.toEqual({
      error: "test-analyzer 模型调用失败: 未找到可用的审计模型",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-stop",
      { stopReason: "length", content: [] },
      "模型返回了非完整响应（length）",
    ],
    ["empty", { stopReason: "stop", content: [] }, "模型返回了空内容"],
    [
      "invalid JSON",
      successfulAuditResponse("not json"),
      "模型返回了无法解析的 JSON",
    ],
  ])("returns an error for %s audit output", async (_label, response, expected) => {
    const { client, complete } = createClient();
    complete.mockResolvedValue(response as never);
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      client,
      auditBinding,
    );

    await expect(analyzer(["item"], "/repo", "", "")).resolves.toEqual({
      error: `test-analyzer ${expected}`,
    });
  });

  it("returns a no-write error when the model request throws", async () => {
    const { client, complete } = createClient();
    complete.mockRejectedValue(new Error("network error"));
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig(),
      client,
      auditBinding,
    );

    await expect(analyzer(["item"], "/repo", "", "")).resolves.toEqual({
      error: "test-analyzer 模型调用失败: network error",
    });
  });

  it("passes the role prompt and captures cost", async () => {
    const { client, complete } = createClient();
    let capturedContext: unknown;
    complete.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve(
        successfulAuditResponse(undefined, {
          usage: { cost: { total: 0.005 } },
        }) as never,
      );
    });
    const analyzer = createRoleAnalyzer(
      makeAnalyzerConfig({
        buildUserPrompt: (input, cwd, judgeMd, judgePrompt) =>
          `cases:${input.length} cwd:${cwd} md:${judgeMd} prompt:${judgePrompt}`,
      }),
      client,
      auditBinding,
    );

    await expect(
      analyzer(["a", "b"], "/repo", "rules", "judge"),
    ).resolves.toMatchObject({
      cost: 0.005,
    });
    const context = capturedContext as {
      systemPrompt: string;
      messages: Array<{ content: string }>;
    };
    expect(context.systemPrompt).toBe("test system prompt");
    expect(context.messages[0].content).toContain(
      "cases:2 cwd:/repo md:rules prompt:judge",
    );
  });
});

describe("createMerger", () => {
  it("uses the Sol Direct Model Binding to merge selected rules", async () => {
    const sol = makeModel();
    const { client, find, complete } = createClient(sol);
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text: "规则1\n新规则" }],
      usage: { cost: { total: 0.003 } },
    } as never);
    const merger = createMerger(client, auditBinding);

    await expect(
      merger({ current: "规则1", operations: ["新规则"] }),
    ).resolves.toEqual({
      mergedText: "规则1\n新规则",
      cost: 0.003,
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-sol");
    expect(complete.mock.calls[0]?.[2]).toEqual({ reasoningEffort: "high" });
  });

  it("does not call a model when the Sol binding is unavailable", async () => {
    const { client, complete } = createClient();
    client.find = vi.fn(() => undefined);

    await expect(
      createMerger(
        client,
        auditBinding,
      )({ current: "规则1", operations: ["新规则"] }),
    ).resolves.toEqual({
      error: "合并模型调用失败: 未找到可用的审计模型",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-stop",
      { stopReason: "toolUse", content: [] },
      "合并模型返回了非完整响应（toolUse）",
    ],
    ["empty", { stopReason: "stop", content: [] }, "合并模型返回了空内容"],
  ])("returns an error for %s merge output", async (_label, response, expected) => {
    const { client, complete } = createClient();
    complete.mockResolvedValue(response as never);

    await expect(
      createMerger(
        client,
        auditBinding,
      )({ current: "规则1", operations: ["新规则"] }),
    ).resolves.toEqual({ error: expected });
  });

  it("keeps the chief merge prompt behavior", async () => {
    const { client, complete } = createClient();
    let capturedContext: unknown;
    complete.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        stopReason: "stop",
        content: [{ type: "text", text: "merged" }],
      } as never);
    });
    const suggestions: ChiefSuggestionItem[] = [
      { type: "add", rule: "新规则X", reason: "遗漏" },
      { type: "modify", oldRule: "规则A", newRule: "规则A改", reason: "过窄" },
    ];

    await createMerger(
      client,
      auditBinding,
    )({
      current: "规则A",
      operations: suggestions,
    });

    const context = capturedContext as { messages: Array<{ content: string }> };
    expect(context.messages[0].content).toContain("[新增] 新规则X");
    expect(context.messages[0].content).toContain('[改写] "规则A" → "规则A改"');
  });
});
