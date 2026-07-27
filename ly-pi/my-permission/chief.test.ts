import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createChief, createChiefMerger } from "./chief";
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
const getAuthOk = vi.fn(async () => ({ apiKey: "test-key" }));

async function mockComplete(value: unknown): Promise<void> {
  const { complete } = await import("@earendil-works/pi-ai");
  (complete as ReturnType<typeof vi.fn>).mockResolvedValue(value);
}

function jsonResponse(obj: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj) }],
  };
}

describe("createChief", () => {
  it("returns error when JUDGE.md is empty", async () => {
    const chief = createChief(config);
    const result = await chief("", "", "/repo", undefined, resolveModelOk, getAuthOk);
    expect(result.error).toBe("项目尚未创建 JUDGE.md，无需审计");
  });

  it("returns error when JUDGE.md is whitespace only", async () => {
    const chief = createChief(config);
    const result = await chief(
      "   \n  \n",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toBe("项目尚未创建 JUDGE.md，无需审计");
  });

  it("returns error when professorModel format is invalid", async () => {
    const badConfig: Config = { ...config, professorModel: "invalid" };
    const chief = createChief(badConfig);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model not found", async () => {
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelNotFound,
      getAuthOk,
    );
    expect(result.error).toContain("未找到审判长模型");
  });

  it("returns empty suggestions when JUDGE.md has no issues", async () => {
    await mockComplete(
      jsonResponse({
        suggestions: [],
        summary: "审计 3 条规则，未发现问题",
      }),
    );
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令\n允许读取配置文件",
      JUDGE_PROMPT,
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toBeUndefined();
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion?.suggestions).toEqual([]);
    expect(result.suggestion?.summary).toContain("未发现问题");
  });

  it("returns suggestions for all four operation types", async () => {
    await mockComplete(
      jsonResponse({
        suggestions: [
          {
            type: "add",
            rule: "禁止读取 SSH 密钥",
            reason: "遗漏盲区",
          },
          {
            type: "remove",
            rule: "允许在项目外执行代码检查",
            reason: "过宽规则",
          },
          {
            type: "modify",
            oldRule: "允许执行 bun run build",
            newRule: "允许在项目及子目录执行 bun run build",
            reason: "过窄规则",
          },
          {
            type: "merge",
            oldRules: ["允许 git add", "允许 git commit"],
            newRule: "允许在项目内执行 git add 和 git commit",
            reason: "可合并",
          },
        ],
        summary: "审计 10 条规则，发现 4 处问题",
      }),
    );
    const chief = createChief(config);
    const result = await chief(
      "允许执行 bun run build\n允许 git add\n允许 git commit",
      JUDGE_PROMPT,
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toBeUndefined();
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion?.suggestions).toHaveLength(4);
    expect(result.suggestion?.suggestions[0].type).toBe("add");
    expect(result.suggestion?.suggestions[1].type).toBe("remove");
    expect(result.suggestion?.suggestions[2].type).toBe("modify");
    expect(result.suggestion?.suggestions[3].type).toBe("merge");
    expect(result.suggestion?.summary).toContain("4 处问题");
  });

  it("returns error when model returns invalid JSON", async () => {
    await mockComplete({
      content: [{ type: "text", text: "not json" }],
    });
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("无法解析");
  });

  it("returns error when model call throws", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error"),
    );
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("调用失败");
  });

  it("returns error when model returns empty content", async () => {
    await mockComplete({ content: [] });
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("空内容");
  });

  it("extracts text from non-text content types", async () => {
    await mockComplete({
      content: [
        {
          type: "reasoning",
          text: JSON.stringify({
            suggestions: [
              { type: "add", rule: "禁止外部 curl", reason: "遗漏" },
            ],
            summary: "发现 1 处问题",
          }),
        },
      ],
    });
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion?.suggestions).toHaveLength(1);
  });

  it("returns error on JSON with missing summary field", async () => {
    await mockComplete(
      jsonResponse({
        suggestions: [{ type: "add", rule: "test", reason: "reason" }],
      }),
    );
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("无法解析");
  });

  it("filters invalid suggestion items", async () => {
    await mockComplete(
      jsonResponse({
        suggestions: [
          { type: "add", rule: "valid rule", reason: "valid reason" },
          { notAType: true },
          { type: "remove" }, // missing rule
          { type: "modify", oldRule: "x", newRule: "y", reason: "" },
          "string item",
        ],
        summary: "found issues",
      }),
    );
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    // modify with empty reason is still valid, remove without rule is invalid, non-object is invalid
    expect(result.suggestion?.suggestions).toHaveLength(2); // add + modify
  });

  it("passes current JUDGE.md and judge prompt to model", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve(
          jsonResponse({ suggestions: [], summary: "no issues" }),
        );
      },
    );

    const currentJudgeMd = "允许执行部署命令\n允许读取配置文件";
    const chief = createChief(config);
    await chief(
      currentJudgeMd,
      JUDGE_PROMPT,
      "/my-project",
      undefined,
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("/my-project");
    expect(msg).toContain("允许执行部署命令");
    expect(msg).toContain("允许读取配置文件");
    expect(msg).toContain(JUDGE_PROMPT);
  });

  it("handles API error responses", async () => {
    await mockComplete({
      content: [],
      stopReason: "error",
      errorMessage: "rate limit exceeded",
    });
    const chief = createChief(config);
    const result = await chief(
      "允许执行部署命令",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("rate limit exceeded");
  });

  it("includes judge prompt in analysis context", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve(
          jsonResponse({ suggestions: [], summary: "ok" }),
        );
      },
    );

    const chiefPrompt = "自定义法官提示词";
    const chief = createChief(config);
    await chief(
      "允许部署",
      chiefPrompt,
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain(chiefPrompt);
  });

  it("handles undefined judge prompt", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve(
          jsonResponse({ suggestions: [], summary: "ok" }),
        );
      },
    );

    const chief = createChief(config);
    await chief(
      "允许部署",
      "", // empty judge prompt
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("（未加载）");
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
      usage: { cost: { total: 0.004 } },
    });

    const chief = createChief(config);
    const result = await chief(
      "允许部署",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.cost).toBe(0.004);
  });

  it("handles missing usage gracefully", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
    });

    const chief = createChief(config);
    const result = await chief(
      "允许部署",
      "",
      "/repo",
      undefined,
      resolveModelOk,
      getAuthOk,
    );
    expect(result.cost).toBeUndefined();
  });
});

// ---- chief merger tests ----

describe("createChiefMerger", () => {
  it("returns error when professorModel format is invalid", async () => {
    const badConfig: Config = { ...config, professorModel: "invalid" };
    const merger = createChiefMerger(badConfig);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新规则", reason: "test" }],
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("professorModel 格式无效");
  });

  it("returns error when model not found", async () => {
    const merger = createChiefMerger(config);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新规则", reason: "test" }],
      resolveModelNotFound,
      getAuthOk,
    );
    expect(result.error).toContain("未找到审判长合并模型");
  });

  it("merges add suggestions into JUDGE.md", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: "现有规则\n新增规则",
        },
      ],
    });
    const merger = createChiefMerger(config);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新增规则", reason: "遗漏" }],
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toBeUndefined();
    expect(result.mergedText).toContain("现有规则");
    expect(result.mergedText).toContain("新增规则");
  });

  it("formats all four operation types in prompt", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [{ type: "text" as const, text: "merged content" }],
        });
      },
    );

    const merger = createChiefMerger(config);
    await merger(
      "规则A\n规则B\n规则C",
      [
        { type: "add", rule: "新规则X", reason: "遗漏" },
        { type: "remove", rule: "规则B", reason: "冗余" },
        {
          type: "modify",
          oldRule: "规则A",
          newRule: "规则A改",
          reason: "过窄",
        },
        {
          type: "merge",
          oldRules: ["规则C", "规则D"],
          newRule: "规则CD合并",
          reason: "可合并",
        },
      ],
      resolveModelOk,
      getAuthOk,
    );

    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("[新增] 新规则X");
    expect(msg).toContain("[删除] 规则B");
    expect(msg).toContain('[改写] "规则A" → "规则A改"');
    expect(msg).toContain('[合并] "规则C" + "规则D" → "规则CD合并"');
  });

  it("returns error on empty response content", async () => {
    await mockComplete({ content: [] });
    const merger = createChiefMerger(config);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新规则", reason: "test" }],
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
    const merger = createChiefMerger(config);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新规则", reason: "test" }],
      resolveModelOk,
      getAuthOk,
    );
    expect(result.error).toContain("调用失败");
  });

  it("captures cost from merge response", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: "merged" }],
      usage: { cost: { total: 0.002 } },
    });
    const merger = createChiefMerger(config);
    const result = await merger(
      "现有规则",
      [{ type: "add", rule: "新规则", reason: "test" }],
      resolveModelOk,
      getAuthOk,
    );
    expect(result.cost).toBe(0.002);
    expect(result.mergedText).toBe("merged");
  });
});
