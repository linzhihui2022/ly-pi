import type { Api, Model } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJudge } from "./judge";
import type { Config, ModelClient, ToolInput } from "./types";

function makeModel(
  overrides: Partial<{ id: string; provider: string }> = {},
): Model<Api> {
  return {
    id: overrides.id ?? "gpt-5.6-luna",
    provider: overrides.provider ?? "openai-codex",
    name: "Luna",
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
  judgeModel: "openai-codex/gpt-5.6-luna",
  auditModel: "openai-codex/gpt-5.6-sol",
  auditThinking: "high",
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};
const prompt =
  '工作目录：{{cwd}}\n工具：{{toolName}}\n输入：{{toolInput}}\n\n只回复 JSON：{\n  "safe": boolean,\n  "score": number,\n  "reason": "...",\n  "toolFor": "..."\n}';
const input: ToolInput = { toolName: "read", value: "src/main.ts", paths: [] };

function failure(reason: string) {
  return { safe: false, reason, toolFor: "read src/main.ts" };
}

function createClient(model = makeModel()) {
  const find = vi.fn(() => model);
  const complete = vi.fn<ModelClient["complete"]>();
  return {
    client: { find, complete } as ModelClient,
    find,
    complete,
  };
}

function createTestJudge(
  client: ModelClient,
  overrides: Partial<Config> = {},
  localJudge?: string,
) {
  return createJudge(
    { ...config, ...overrides },
    {
      judgePrompt: prompt,
      localJudge,
      modelClient: client,
    },
  );
}

function successfulResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    stopReason: "stop",
    content: [
      {
        type: "text",
        text: '{"safe":true,"score":8,"reason":"read only","toolFor":"read file"}',
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createJudge", () => {
  it("uses the configured Luna Direct Model Binding without reasoning effort", async () => {
    const luna = makeModel();
    const { client, find, complete } = createClient(luna);
    complete.mockResolvedValue(successfulResponse() as never);

    const result = await createTestJudge(client)(input, "/repo");

    expect(result).toEqual({
      safe: true,
      score: 8,
      reason: "read only",
      toolFor: "read file",
      modelUsed: "openai-codex/gpt-5.6-luna",
    });
    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-luna");
    expect(complete).toHaveBeenCalledWith(
      luna,
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(complete.mock.calls[0]?.[2]).not.toHaveProperty("reasoningEffort");
  });

  it("fails closed when the Luna binding is unavailable", async () => {
    const { client, complete } = createClient();
    client.find = vi.fn(() => undefined);

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual(
      failure("未找到可用的法官模型，请手动确认"),
    );
    expect(complete).not.toHaveBeenCalled();
  });

  it("fails closed when the judge prompt is unavailable", async () => {
    const { client, find } = createClient();
    const judge = createJudge(config, { modelClient: client });

    await expect(judge(input, "/repo")).resolves.toEqual(
      failure("法官提示词未加载，请手动确认"),
    );
    expect(find).not.toHaveBeenCalled();
  });

  it("returns an unsafe model verdict with the directly bound model", async () => {
    const { client, complete } = createClient();
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [
        {
          type: "text",
          text: '{"safe":false,"score":3,"reason":"destructive","toolFor":"delete files"}',
        },
      ],
    } as never);

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual({
      safe: false,
      score: 3,
      reason: "destructive",
      toolFor: "delete files",
      modelUsed: "openai-codex/gpt-5.6-luna",
    });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["missing safe", '{"score":8,"reason":"ok","toolFor":"read"}'],
    [
      "invalid score",
      '{"safe":true,"score":11,"reason":"ok","toolFor":"read"}',
    ],
  ])("fails closed for %s judge output", async (_label, text) => {
    const { client, complete } = createClient();
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text }],
    } as never);

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual(
      failure("法官模型返回格式不正确，请手动确认"),
    );
  });

  it("parses JSON wrapped in a markdown code fence", async () => {
    const { client, complete } = createClient();
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [
        {
          type: "text",
          text: '```json\n{"safe":true,"score":7,"reason":"ok","toolFor":"read"}\n```',
        },
      ],
    } as never);

    await expect(
      createTestJudge(client)(input, "/repo"),
    ).resolves.toMatchObject({
      safe: true,
      score: 7,
      reason: "ok",
      toolFor: "read",
    });
  });

  it.each([
    ["error", undefined, "法官模型调用失败: error"],
    ["stop", "missing key", "法官模型调用失败: missing key"],
    ["length", undefined, "法官模型返回了非完整响应（length），请手动确认"],
  ] as const)("fails closed for a %s model response", async (stopReason, errorMessage, expectedReason) => {
    const { client, complete } = createClient();
    complete.mockResolvedValue({
      stopReason,
      errorMessage,
      content: [],
    } as never);

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual(
      failure(expectedReason),
    );
  });

  it("fails closed when the model request throws", async () => {
    const { client, complete } = createClient();
    complete.mockRejectedValue(new Error("network error"));

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual(
      failure("法官模型调用失败，请手动确认"),
    );
  });

  it("fails closed when the model reports an aborted response", async () => {
    const { client, complete } = createClient();
    complete.mockResolvedValue({ stopReason: "aborted", content: [] } as never);

    await expect(createTestJudge(client)(input, "/repo")).resolves.toEqual(
      failure("法官模型调用超时（5000ms），请手动确认"),
    );
  });

  it("aborts and fails closed at the configured timeout", async () => {
    vi.useFakeTimers();
    const { client, complete } = createClient();
    let signal: AbortSignal | undefined;
    complete.mockImplementation((_model, _context, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    });

    const result = createTestJudge(client)(input, "/repo");
    await vi.advanceTimersByTimeAsync(config.judgeTimeoutMs);

    await expect(result).resolves.toEqual(
      failure("法官模型调用超时（5000ms），请手动确认"),
    );
    expect(signal?.aborted).toBe(true);
  });

  it("adds project rules to the direct judge prompt", async () => {
    const { client, complete } = createClient();
    let capturedContext: unknown;
    complete.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve(successfulResponse() as never);
    });

    await createTestJudge(client, {}, "允许读取项目配置")(input, "/repo");

    const context = capturedContext as {
      messages: Array<{ content: string }>;
    };
    expect(context.messages[0].content).toContain("工作目录：/repo");
    expect(context.messages[0].content).toContain("工具：read");
    expect(context.messages[0].content).toContain("允许读取项目配置");
  });

  it("records response cost", async () => {
    const { client, complete } = createClient();
    complete.mockResolvedValue(
      successfulResponse({ usage: { cost: { total: 0.000085 } } }) as never,
    );

    await expect(
      createTestJudge(client)(input, "/repo"),
    ).resolves.toMatchObject({
      cost: 0.000085,
    });
  });
});
