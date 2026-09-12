import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { createJudge } from "./judge";
import { createMerger } from "./pipeline";
import type { ModelClient, ToolInput } from "./types";

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

function createClient(model: Model<Api> | undefined) {
  const find = vi.fn(() => model);
  const complete = vi.fn<ModelClient["complete"]>();
  return { client: { find, complete } as ModelClient, find, complete };
}

const input: ToolInput = { toolName: "read", value: "src/main.ts", paths: [] };
const judgePrompt =
  '工作目录：{{cwd}}\n工具：{{toolName}}\n输入：{{toolInput}}\n\n只回复 JSON：{"safe":true,"score":8,"reason":"ok","toolFor":"read"}';

describe("default direct model bindings", () => {
  it("binds Judge to DeepSeek Flash without reasoning effort", async () => {
    const flash = makeModel("deepseek", "deepseek-flash");
    const { client, find, complete } = createClient(flash);
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"ok","toolFor":"read"}',
        },
      ],
    } as never);

    const result = await createJudge(config, {
      judgePrompt,
      modelClient: client,
    })(input, "/repo");

    expect(result).toMatchObject({
      safe: true,
      modelUsed: "deepseek/deepseek-flash",
    });
    expect(find).toHaveBeenCalledWith("deepseek", "deepseek-flash");
    expect(complete.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(complete.mock.calls[0]?.[2]).not.toHaveProperty("reasoningEffort");
  });

  it("binds Audit to GPT-6 Astra with max reasoning effort", async () => {
    const astra = makeModel("openai-codex", "gpt-6-astra");
    const { client, find, complete } = createClient(astra);
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text: "merged rules" }],
    } as never);

    const result = await createMerger(client, {
      model: config.auditModel,
      thinking: config.auditThinking,
    })({ current: "existing rules", operations: ["allow read"] });

    expect(result).toMatchObject({
      mergedText: "merged rules",
      modelUsed: "openai-codex/gpt-6-astra",
    });
    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-6-astra");
    expect(complete).toHaveBeenCalledWith(astra, expect.any(Object), {
      reasoningEffort: "max",
    });
  });

  it("keeps unavailable default bindings fail closed", async () => {
    const judgeClient = createClient(undefined);
    const judgeResult = await createJudge(config, {
      judgePrompt,
      modelClient: judgeClient.client,
    })(input, "/repo");
    const auditClient = createClient(undefined);
    const auditResult = await createMerger(auditClient.client, {
      model: config.auditModel,
      thinking: config.auditThinking,
    })({ current: "existing rules", operations: ["allow read"] });

    expect(judgeResult).toMatchObject({ safe: false });
    expect(judgeResult.reason).toContain("请手动确认");
    expect(judgeClient.complete).not.toHaveBeenCalled();
    expect(auditResult).toEqual({
      error: "合并模型调用失败: 未找到可用的审计模型",
    });
    expect(auditClient.complete).not.toHaveBeenCalled();
  });
});
