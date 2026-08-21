import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createModelPolicyRegistry,
  type ModelCandidate,
  type ModelPolicyManifest,
} from "../model-policy/registry";
import { createJudge } from "./judge";
import type { Config, ModelClient } from "./types";

function makeModel(
  overrides: Partial<{ id: string; provider: string }> = {},
): Model<Api> {
  return {
    id: overrides.id ?? "deepseek-v4-flash",
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

const resolvedModel = makeModel();

const config: Config = {
  defaultPolicy: "ask",
  judgeModel: "deepseek/deepseek-v4-flash",
  professorModel: "deepseek/deepseek-v4-flash",
  professorThinking: "low",
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const JUDGE_PROMPT =
  '工作目录：{{cwd}}\n工具：{{toolName}}\n输入：{{toolInput}}\n\n只回复 JSON：{\n  "safe": boolean,\n  "score": number,\n  "reason": "...",\n  "toolFor": "..."\n}\n\n判断标准：只读操作安全，破坏性操作不安全。';

const input = { toolName: "read", value: "src/main.ts", paths: [] };
const resolveModelOk = () => resolvedModel;
const resolveFnOk = vi.fn(resolveModelOk);
const completeModel = vi.fn<ModelClient["complete"]>();
const modelClient: ModelClient = { find: resolveFnOk, complete: completeModel };

function createSuccessfulModelRunner(
  model = resolvedModel,
  candidateModel = `${model.provider}/${model.id}`,
) {
  const run = vi.fn(
    async (
      _role: string,
      _models: ModelClient,
      operation: (model: Model<Api>) => Promise<unknown>,
    ) => ({
      status: "success" as const,
      value: await operation(model),
      candidate: {
        slot: "primary",
        model: candidateModel,
        label: "Security judge",
        thinking: "off",
        source: "manifest" as const,
      },
    }),
  );
  return { modelRunner: { run } as never, run };
}

function createSecurityJudgeRunner(candidates: readonly ModelCandidate[]) {
  const manifest: ModelPolicyManifest = {
    version: 1,
    policies: {
      "security-judge-test": {
        candidates,
        capabilities: { input: ["text"], minContextWindow: 128000 },
        failurePolicy: "confirm",
        security: true,
      },
    },
    roles: {
      primary: "security-judge-test",
      fast: "security-judge-test",
      standard: "security-judge-test",
      deep: "security-judge-test",
      vision: "security-judge-test",
      "security-judge": "security-judge-test",
      "security-audit": "security-judge-test",
    },
    deployment: { primary: "primary", agents: {} },
  };
  return createModelPolicyRegistry(manifest);
}

const defaultModelRunner = createSuccessfulModelRunner();
const judgeDeps = {
  judgePrompt: JUDGE_PROMPT,
  modelClient,
  modelRunner: defaultModelRunner.modelRunner,
};

beforeEach(() => {
  completeModel.mockReset();
  defaultModelRunner.run.mockClear();
  resolveFnOk.mockClear();
});

function failureReason(
  input: { toolName: string; value: string },
  reason: string,
) {
  return {
    safe: false,
    reason,
    toolFor: `${input.toolName} ${input.value}`,
  };
}

async function mockComplete(value: unknown): Promise<void> {
  completeModel.mockResolvedValue(value as never);
}

describe("createJudge", () => {
  it("returns safe result when model says safe", async () => {
    completeModel.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"read only","toolFor":"read file"}',
        },
      ],
    } as never);
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual({
      safe: true,
      score: 8,
      reason: "read only",
      toolFor: "read file",
      modelUsed: "deepseek/deepseek-v4-flash",
    });
  });

  it("requests security-judge through the model runner", async () => {
    completeModel.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"read only","toolFor":"read file"}',
        },
      ],
    } as never);
    const { modelRunner, run } = createSuccessfulModelRunner(
      resolvedModel,
      "test/security-judge",
    );
    const judge = createJudge(config, { ...judgeDeps, modelRunner });

    await judge(input, "/repo");

    expect(run).toHaveBeenCalledWith(
      "security-judge",
      modelClient,
      expect.any(Function),
    );
  });

  it("fails closed when security-judge candidates are exhausted", async () => {
    const judge = createJudge(config, {
      ...judgeDeps,
      modelClient: { ...modelClient, find: () => undefined },
      modelRunner: createSecurityJudgeRunner([
        {
          slot: "primary",
          model: "test/security-judge",
          label: "Security judge",
          thinking: "off",
        },
      ]),
    });

    await expect(judge(input, "/repo")).resolves.toEqual(
      failureReason(input, "未找到可用的法官模型，请手动确认"),
    );
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("uses the next security-judge candidate after rate limiting", async () => {
    const primary = makeModel({ id: "primary", provider: "test" });
    const fallback = makeModel({ id: "fallback", provider: "test" });
    const complete = vi
      .fn<ModelClient["complete"]>()
      .mockResolvedValueOnce({
        content: [],
        stopReason: "error",
        errorMessage: "rate limited",
      } as never)
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: '{"safe":true,"score":9,"reason":"fallback ok","toolFor":"read"}',
          },
        ],
      } as never);
    const securityModelClient: ModelClient = {
      find: (_provider, id) =>
        id === "primary" ? primary : id === "fallback" ? fallback : undefined,
      complete,
    };
    const judge = createJudge(config, {
      judgePrompt: JUDGE_PROMPT,
      modelClient: securityModelClient,
      modelRunner: createSecurityJudgeRunner([
        {
          slot: "primary",
          model: "test/primary",
          label: "Primary security judge",
          thinking: "off",
        },
        {
          slot: "fallback",
          model: "test/fallback",
          label: "Fallback security judge",
          thinking: "off",
        },
      ]),
    });

    await expect(judge(input, "/repo")).resolves.toEqual({
      safe: true,
      score: 9,
      reason: "fallback ok",
      toolFor: "read",
      modelUsed: "test/fallback",
    });
    expect(complete.mock.calls.map(([model]) => model.id)).toEqual([
      "primary",
      "fallback",
    ]);
  });

  it("does not retry after a malformed judge protocol response", async () => {
    const primary = makeModel({ id: "primary", provider: "test" });
    const fallback = makeModel({ id: "fallback", provider: "test" });
    const complete = vi.fn<ModelClient["complete"]>().mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    } as never);
    const securityModelClient: ModelClient = {
      find: (_provider, id) =>
        id === "primary" ? primary : id === "fallback" ? fallback : undefined,
      complete,
    };
    const judge = createJudge(config, {
      judgePrompt: JUDGE_PROMPT,
      modelClient: securityModelClient,
      modelRunner: createSecurityJudgeRunner([
        {
          slot: "primary",
          model: "test/primary",
          label: "Primary security judge",
          thinking: "off",
        },
        {
          slot: "fallback",
          model: "test/fallback",
          label: "Fallback security judge",
          thinking: "off",
        },
      ]),
    });

    await expect(judge(input, "/repo")).resolves.toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
    expect(complete.mock.calls.map(([model]) => model.id)).toEqual(["primary"]);
  });

  it("returns unsafe result when model says unsafe", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":false,"score":3,"reason":"destructive","toolFor":"delete files"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(
      { toolName: "bash", value: "rm -rf /", paths: [] },
      "/repo",
    );
    expect(result).toEqual({
      safe: false,
      score: 3,
      reason: "destructive",
      toolFor: "delete files",
      modelUsed: "deepseek/deepseek-v4-flash",
    });
  });

  it("returns failure result on invalid JSON", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when model response has no text content", async () => {
    await mockComplete({ content: [] });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when response has stopReason: error", async () => {
    await mockComplete({
      content: [],
      stopReason: "error",
      errorMessage: "No API key for provider: deepseek",
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(
        input,
        "法官模型调用失败: No API key for provider: deepseek",
      ),
    );
  });

  it("returns failure result when response has errorMessage but no stopReason", async () => {
    await mockComplete({
      content: [],
      errorMessage: "rate limited",
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型调用失败: rate limited"),
    );
  });

  it("does not enable reasoning for judge calls", async () => {
    completeModel.mockResolvedValue({
      content: [
        {
          type: "text" as const,
          text: '{"safe":true,"score":8,"reason":"ok","toolFor":"read"}',
        },
      ],
    } as never);
    const judge = createJudge(config, judgeDeps);
    await judge(input, "/repo");
    const options = completeModel.mock.calls.at(-1)?.[2] as Record<
      string,
      unknown
    >;
    expect(options.thinking).toBeUndefined();
    expect(options.reasoningEffort).toBeUndefined();
  });

  it("returns failure result when JSON is missing 'safe' field", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"score":5,"reason":"ok","toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when 'reason' is not a string", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":5,"reason":42,"toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when 'score' is missing", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":false,"reason":"ok","toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when 'score' is out of range", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":false,"score":11,"reason":"ok","toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result on model call throwing", async () => {
    completeModel.mockRejectedValue(new Error("network error"));
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型调用失败，请手动确认"),
    );
  });

  it("parses JSON wrapped in markdown code fence", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '```json\n{"safe":true,"score":7,"reason":"ok","toolFor":"do stuff"}\n```',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual({
      safe: true,
      score: 7,
      reason: "ok",
      toolFor: "do stuff",
      modelUsed: "deepseek/deepseek-v4-flash",
    });
  });

  it("builds prompt with correct context", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [
          {
            type: "text" as const,
            text: '{"safe":true,"score":6,"reason":"ok","toolFor":"do"}',
          },
        ],
      } as never);
    });
    const judge = createJudge(config, judgeDeps);
    await judge(
      { toolName: "bash", value: "rm file", paths: [] },
      "/my-project",
    );
    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("/my-project");
    expect(msg).toContain("bash");
    expect(msg).toContain("rm file");
    expect(msg).toContain('"score": number');
    expect(msg).toContain("判断标准");
  });

  it("returns failure result on malformed JSON with braces", async () => {
    await mockComplete({
      content: [{ type: "text", text: "{not valid json}" }],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns timeout failure result", async () => {
    let abortSignal: AbortSignal | undefined;
    completeModel.mockImplementation((_model, _context, options) => {
      abortSignal = options?.signal;
      return new Promise((_resolve, reject) => {
        if (abortSignal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        abortSignal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    });

    const shortConfig: Config = { ...config, judgeTimeoutMs: 1 };
    const judge = createJudge(shortConfig, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result).toEqual(
      failureReason(input, "法官模型调用超时（1ms），请手动确认"),
    );
  });

  it("captures cost from response usage", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"ok","toolFor":"read"}',
        },
      ],
      usage: { cost: { total: 0.000085 } },
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result.cost).toBe(0.000085);
  });

  it("handles missing usage gracefully", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":9,"reason":"ok","toolFor":"read"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo");
    expect(result.cost).toBeUndefined();
  });
});
