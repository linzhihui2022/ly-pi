import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAdvocatePrompt, createAdvocate } from "./professor";
import type { DeniedThenApproved } from "./stats";
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

function makeCase(
  overrides: Partial<DeniedThenApproved> = {},
): DeniedThenApproved {
  return {
    toolName: "bash",
    value: "git commit -m 'test'",
    judgeReason: "git commit may modify repository state",
    context: [],
    ...overrides,
  };
}

const JUDGE_PROMPT = "你是一名编码助手的安全门禁。评估以下工具调用。";

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

describe("buildAdvocatePrompt", () => {
  it("includes all cases with their details", () => {
    const cases: DeniedThenApproved[] = [
      {
        toolName: "bash",
        value: "git commit -m 'feat: add x'",
        judgeReason: "may modify repo",
        context: [{ role: "assistant", content: "let me commit the changes" }],
      },
      {
        toolName: "bash",
        value: "ls /tmp",
        judgeReason: "accessing outside project dir",
        context: [],
      },
    ];

    const prompt = buildAdvocatePrompt(cases, "", JUDGE_PROMPT, "/my-project");

    expect(prompt).toContain("### 案例 1");
    expect(prompt).toContain("git commit");
    expect(prompt).toContain("may modify repo");
    expect(prompt).toContain("let me commit the changes");
    expect(prompt).toContain("### 案例 2");
    expect(prompt).toContain("ls /tmp");
    expect(prompt).toContain("accessing outside project dir");
    expect(prompt).toContain("（无上下文）");
    expect(prompt).toContain("/my-project");
  });

  it("includes judge prompt in the output", () => {
    const cases = [makeCase()];
    const prompt = buildAdvocatePrompt(cases, "", JUDGE_PROMPT, "/repo");
    expect(prompt).toContain("## 法官的原始判断提示词");
    expect(prompt).toContain(JUDGE_PROMPT);
  });

  it("shows empty placeholder when no current judgeMd", () => {
    const cases = [makeCase()];
    const prompt = buildAdvocatePrompt(cases, "", JUDGE_PROMPT, "/repo");
    expect(prompt).toContain("（空，尚未编写项目级判断规则）");
  });

  it("includes current JUDGE.md content with line numbers", () => {
    const cases = [makeCase()];
    const prompt = buildAdvocatePrompt(
      cases,
      "规则一\n规则二",
      JUDGE_PROMPT,
      "/repo",
    );
    expect(prompt).toContain("1. 规则一");
    expect(prompt).toContain("2. 规则二");
  });

  it("truncates long context messages to 200 chars", () => {
    const longContent = "a".repeat(300);
    const cases: DeniedThenApproved[] = [
      {
        toolName: "bash",
        value: "echo test",
        judgeReason: "unknown",
        context: [{ role: "user", content: longContent }],
      },
    ];
    const prompt = buildAdvocatePrompt(cases, "", JUDGE_PROMPT, "/repo");
    const lines = prompt.split("\n");
    const contextLine = lines.find((l) => l.includes("a".repeat(200)));
    expect(contextLine).toBeDefined();
    expect(contextLine?.length).toBeLessThanOrEqual(209);
  });
});

describe("createAdvocate", () => {
  it("returns error when no cases", async () => {
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toBe("当前会话没有法官误判案例");
  });

  it("returns parsed add/remove suggestion", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            add: [{ rule: "git 操作应判定为安全", reason: "被误判 5 次" }],
            remove: ["过时规则"],
          }),
        },
      ],
    });

    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);

    expect(result.error).toBeUndefined();
    expect(result.suggestion).toEqual({
      add: [{ rule: "git 操作应判定为安全", reason: "被误判 5 次" }],
      remove: ["过时规则"],
    });
  });

  it("returns error on invalid JSON response", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("无法解析");
  });

  it("returns error on JSON with missing fields", async () => {
    await mockComplete({
      content: [{ type: "text", text: JSON.stringify({ add: [] }) }],
    });
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("无法解析");
  });

  it("returns error when professorModel has no provider separator", async () => {
    const badConfig: Config = { ...config, professorModel: "some-model" };
    const advocate = createAdvocate(badConfig, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when advocate model is unavailable", async () => {
    const advocate = createAdvocate(config, {
      ...modelClient,
      find: resolveModelNotFound,
    });
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("未找到 advocate 模型");
  });

  it("returns error when the model call fails", async () => {
    completeModel.mockRejectedValue(new Error("network error"));
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("advocate 模型调用失败");
  });

  it("returns error when the model response has no text", async () => {
    await mockComplete({ content: [] });
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toBeUndefined();
    expect(result.error).toContain("空内容");
  });

  it("parses JSON wrapped in a markdown code fence", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text:
            "```json\n" +
            JSON.stringify({
              add: [{ rule: "规则", reason: "原因" }],
              remove: [],
            }) +
            "\n```",
        },
      ],
    });
    const advocate = createAdvocate(config, modelClient);
    const result = await advocate([makeCase()], "/repo", "", JUDGE_PROMPT);
    expect(result.suggestion).toEqual({
      add: [{ rule: "规则", reason: "原因" }],
      remove: [],
    });
  });
});
