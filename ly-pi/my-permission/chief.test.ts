import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChief, createChiefMerger } from "./chief";
import type { DirectModelBinding } from "./direct-model";
import type { ModelClient } from "./types";

function makeModel(): Model<Api> {
  return {
    id: "gpt-5.6-sol",
    provider: "openai-codex",
    name: "Sol",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: true,
  } as Model<Api>;
}

const JUDGE_PROMPT = "你是一名编码助手的安全门禁。评估以下工具调用。";
const auditBinding: DirectModelBinding = {
  model: "openai-codex/gpt-5.6-sol",
  thinking: "high",
};
const complete = vi.fn<ModelClient["complete"]>();
const find = vi.fn<ModelClient["find"]>(() => makeModel());
const modelClient: ModelClient = { find, complete };

beforeEach(() => {
  complete.mockReset();
  find.mockReset();
  find.mockReturnValue(makeModel());
});

function response(value: unknown) {
  return {
    stopReason: "stop",
    content: [{ type: "text", text: JSON.stringify(value) }],
  } as never;
}

describe("createChief", () => {
  it("returns the empty-rule error without calling Sol", async () => {
    await expect(
      createChief(modelClient, auditBinding)("", "", "/repo", undefined),
    ).resolves.toEqual({ error: "项目尚未创建 JUDGE.md，无需审计" });
    expect(find).not.toHaveBeenCalled();
  });

  it("returns all suggestion types from the Sol Direct Model Binding", async () => {
    complete.mockResolvedValue(
      response({
        suggestions: [
          { type: "add", rule: "禁止读取 SSH 密钥", reason: "遗漏" },
          { type: "remove", rule: "允许项目外执行", reason: "过宽" },
          {
            type: "modify",
            oldRule: "允许 build",
            newRule: "仅允许项目内 build",
            reason: "收窄",
          },
          {
            type: "merge",
            oldRules: ["允许 git add", "允许 git commit"],
            newRule: "允许项目内 git 写操作",
            reason: "合并",
          },
        ],
        summary: "发现 4 处问题",
      }),
    );

    await expect(
      createChief(modelClient, auditBinding)(
        "允许 build",
        JUDGE_PROMPT,
        "/repo",
        undefined,
      ),
    ).resolves.toMatchObject({
      suggestion: { summary: "发现 4 处问题" },
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
    expect(complete.mock.calls[0]?.[2]).toEqual({ reasoningEffort: "high" });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["incomplete JSON", JSON.stringify({ suggestions: [] })],
  ])("returns an error for %s", async (_label, text) => {
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text }],
    } as never);

    await expect(
      createChief(modelClient, auditBinding)(
        "允许 build",
        JUDGE_PROMPT,
        "/repo",
        undefined,
      ),
    ).resolves.toMatchObject({ error: expect.stringContaining("无法解析") });
  });

  it("filters invalid suggestion entries", async () => {
    complete.mockResolvedValue(
      response({
        suggestions: [
          { type: "add", rule: "允许 git status", reason: "有效" },
          {
            type: "merge",
            oldRules: ["合法", 3],
            newRule: "无效",
            reason: "坏",
          },
        ],
        summary: "有一条有效建议",
      }),
    );

    await expect(
      createChief(modelClient, auditBinding)(
        "允许 build",
        JUDGE_PROMPT,
        "/repo",
        undefined,
      ),
    ).resolves.toMatchObject({
      suggestion: {
        suggestions: [{ type: "add", rule: "允许 git status", reason: "有效" }],
      },
    });
  });

  it("does not produce a suggestion when Sol is unavailable", async () => {
    find.mockReturnValue(undefined);

    await expect(
      createChief(modelClient, auditBinding)(
        "允许 build",
        JUDGE_PROMPT,
        "/repo",
        undefined,
      ),
    ).resolves.toEqual({
      suggestion: undefined,
      error: "chief 模型调用失败: 未找到可用的审计模型",
      cost: undefined,
      modelUsed: undefined,
    });
  });
});

describe("createChiefMerger", () => {
  it("uses Sol to merge selected chief suggestions", async () => {
    complete.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text: "规则 A\n规则 B" }],
      usage: { cost: { total: 0.004 } },
    } as never);

    await expect(
      createChiefMerger(modelClient, auditBinding)("规则 A", [
        { type: "add", rule: "规则 B", reason: "遗漏" },
      ]),
    ).resolves.toEqual({
      mergedText: "规则 A\n规则 B",
      cost: 0.004,
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
  });

  it("returns a no-write error when the merger model is unavailable", async () => {
    find.mockReturnValue(undefined);

    await expect(
      createChiefMerger(modelClient, auditBinding)("规则 A", [
        { type: "add", rule: "规则 B", reason: "遗漏" },
      ]),
    ).resolves.toEqual({
      mergedText: undefined,
      error: "合并模型调用失败: 未找到可用的审计模型",
      cost: undefined,
      modelUsed: undefined,
    });
  });
});
