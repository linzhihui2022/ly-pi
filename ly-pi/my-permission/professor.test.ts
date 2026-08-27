import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectModelBinding } from "./direct-model";
import { buildAdvocatePrompt, createAdvocate, createMerger } from "./professor";
import type { DeniedThenApproved } from "./stats";
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

function response(text: string) {
  return { stopReason: "stop", content: [{ type: "text", text }] } as never;
}

describe("buildAdvocatePrompt", () => {
  it("includes cases, context, prompt, and numbered current rules", () => {
    const prompt = buildAdvocatePrompt(
      [
        makeCase({
          context: [
            { role: "assistant", content: "let me commit the changes" },
          ],
        }),
        makeCase({ value: "ls /tmp", context: [] }),
      ],
      "规则一\n规则二",
      JUDGE_PROMPT,
      "/my-project",
    );

    expect(prompt).toContain("### 案例 1");
    expect(prompt).toContain("let me commit the changes");
    expect(prompt).toContain("### 案例 2");
    expect(prompt).toContain("（无上下文）");
    expect(prompt).toContain("1. 规则一");
    expect(prompt).toContain("2. 规则二");
    expect(prompt).toContain(JUDGE_PROMPT);
    expect(prompt).toContain("/my-project");
  });

  it("truncates long context messages", () => {
    const prompt = buildAdvocatePrompt(
      [makeCase({ context: [{ role: "user", content: "a".repeat(300) }] })],
      "",
      JUDGE_PROMPT,
      "/repo",
    );

    expect(prompt).toContain("a".repeat(200));
    expect(prompt).not.toContain("a".repeat(201));
  });
});

describe("createAdvocate", () => {
  it("returns the empty-case error without calling Sol", async () => {
    const advocate = createAdvocate(modelClient, auditBinding);

    await expect(advocate([], "/repo", "", JUDGE_PROMPT)).resolves.toEqual({
      error: "当前会话没有法官误判案例",
    });
    expect(find).not.toHaveBeenCalled();
  });

  it("returns parsed suggestions from the Sol Direct Model Binding", async () => {
    complete.mockResolvedValue(
      response(
        JSON.stringify({
          add: [{ rule: "允许 git status", reason: "被误判" }],
          remove: ["过时规则"],
        }),
      ),
    );

    await expect(
      createAdvocate(modelClient, auditBinding)(
        [makeCase()],
        "/repo",
        "",
        JUDGE_PROMPT,
      ),
    ).resolves.toEqual({
      suggestion: {
        add: [{ rule: "允许 git status", reason: "被误判" }],
        remove: ["过时规则"],
      },
      error: undefined,
      cost: undefined,
      modelUsed: "openai-codex/gpt-5.6-sol",
    });
    expect(complete.mock.calls[0]?.[2]).toEqual({ reasoningEffort: "high" });
  });

  it.each([
    ["invalid JSON", "not json", "无法解析"],
    ["incomplete JSON", JSON.stringify({ add: [] }), "无法解析"],
  ])("returns an error for %s", async (_label, text, expected) => {
    complete.mockResolvedValue(response(text));

    await expect(
      createAdvocate(modelClient, auditBinding)(
        [makeCase()],
        "/repo",
        "",
        JUDGE_PROMPT,
      ),
    ).resolves.toMatchObject({ error: expect.stringContaining(expected) });
  });

  it("does not produce a suggestion when Sol is unavailable", async () => {
    find.mockReturnValue(undefined);

    await expect(
      createAdvocate(modelClient, auditBinding)(
        [makeCase()],
        "/repo",
        "",
        JUDGE_PROMPT,
      ),
    ).resolves.toEqual({
      suggestion: undefined,
      error: "advocate 模型调用失败: 未找到可用的审计模型",
      cost: undefined,
      modelUsed: undefined,
    });
  });

  it("keeps merger failures from producing merged text", async () => {
    find.mockReturnValue(undefined);

    await expect(
      createMerger(modelClient, auditBinding)("规则", ["新规则"]),
    ).resolves.toEqual({
      mergedText: undefined,
      error: "合并模型调用失败: 未找到可用的审计模型",
      cost: undefined,
      modelUsed: undefined,
    });
  });
});
