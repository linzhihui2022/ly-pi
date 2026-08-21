import type { Api, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChief, createChiefMerger } from "./chief";
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

const JUDGE_PROMPT = "你是一名编码助手的安全门禁。评估以下工具调用。";

const completeModel = vi.fn<ModelClient["complete"]>();
const modelClient: ModelClient = {
  find: vi.fn(() => makeModel()),
  complete: completeModel,
};

function createSecurityAuditRunner(thinking: "off" | "max" = "max") {
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

function createFailedSecurityAuditRunner(reason: string) {
  return {
    run: vi.fn(async () => ({
      status: "failure" as const,
      failurePolicy: "error-no-write" as const,
      reason,
    })),
  } as never;
}

const defaultSecurityAuditRunner = createSecurityAuditRunner();

beforeEach(() => {
  completeModel.mockReset();
  defaultSecurityAuditRunner.run.mockClear();
});

function jsonResponse(obj: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj) }],
  };
}

describe("createChief", () => {
  it("returns error when JUDGE.md is empty", async () => {
    const chief = createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    );
    const result = await chief("", "", "/repo", undefined);
    expect(result.error).toBe("项目尚未创建 JUDGE.md，无需审计");
    expect(defaultSecurityAuditRunner.run).not.toHaveBeenCalled();
  });

  it("requests security-audit", async () => {
    completeModel.mockResolvedValue(
      jsonResponse({ suggestions: [], summary: "未发现问题" }) as never,
    );
    const result = await createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("允许执行部署命令", JUDGE_PROMPT, "/repo", undefined);

    expect(defaultSecurityAuditRunner.run).toHaveBeenCalledWith(
      "security-audit",
      modelClient,
      expect.any(Function),
    );
    expect(result.error).toBeUndefined();
    expect(result.modelUsed).toBe("security/audit");
  });

  it("returns suggestions for all four operation types", async () => {
    completeModel.mockResolvedValue(
      jsonResponse({
        suggestions: [
          { type: "add", rule: "禁止读取 SSH 密钥", reason: "遗漏盲区" },
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
      }) as never,
    );
    const result = await createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )(
      "允许执行 bun run build\n允许 git add\n允许 git commit",
      JUDGE_PROMPT,
      "/repo",
      undefined,
    );

    expect(result.suggestion?.suggestions.map((item) => item.type)).toEqual([
      "add",
      "remove",
      "modify",
      "merge",
    ]);
  });

  it("returns error on invalid or incomplete JSON", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    } as never);
    const chief = createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    );
    await expect(
      chief("允许部署", "", "/repo", undefined),
    ).resolves.toMatchObject({
      error: expect.stringContaining("无法解析"),
    });

    completeModel.mockResolvedValue(jsonResponse({ suggestions: [] }) as never);
    await expect(
      chief("允许部署", "", "/repo", undefined),
    ).resolves.toMatchObject({
      error: expect.stringContaining("无法解析"),
    });
  });

  it("filters invalid suggestion items", async () => {
    completeModel.mockResolvedValue(
      jsonResponse({
        suggestions: [
          { type: "add", rule: "valid rule", reason: "valid reason" },
          { type: "remove" },
          { type: "modify", oldRule: "x", newRule: "y", reason: "" },
          "string item",
        ],
        summary: "found issues",
      }) as never,
    );
    const result = await createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("允许部署", "", "/repo", undefined);

    expect(result.suggestion?.suggestions).toHaveLength(2);
  });

  it("returns a clear error when security-audit is unavailable", async () => {
    const result = await createChief(
      modelClient,
      createFailedSecurityAuditRunner("no usable candidate"),
    )("允许部署", "", "/repo", undefined);

    expect(result.error).toContain("no usable candidate");
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("returns errors for model failure and empty content", async () => {
    const chief = createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    );
    completeModel.mockRejectedValue(new Error("network error"));
    await expect(
      chief("允许部署", "", "/repo", undefined),
    ).resolves.toMatchObject({
      error: expect.stringContaining("调用失败"),
    });

    completeModel.mockResolvedValue({ content: [] } as never);
    await expect(
      chief("允许部署", "", "/repo", undefined),
    ).resolves.toMatchObject({
      error: expect.stringContaining("空内容"),
    });
  });

  it("passes JUDGE.md, judge prompt, cwd, and instruction to the model", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve(
        jsonResponse({ suggestions: [], summary: "ok" }) as never,
      );
    });
    await createChief(modelClient, defaultSecurityAuditRunner.modelRunner)(
      "允许部署",
      "自定义法官提示词",
      "/my-project",
      "检查过宽规则",
    );

    const context = capturedContext as { messages: Array<{ content: string }> };
    expect(context.messages[0].content).toContain("允许部署");
    expect(context.messages[0].content).toContain("自定义法官提示词");
    expect(context.messages[0].content).toContain("/my-project");
    expect(context.messages[0].content).toContain("检查过宽规则");
  });

  it("captures cost from the selected security-audit candidate", async () => {
    completeModel.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "ok" }),
        },
      ],
      usage: { cost: { total: 0.004 } },
    } as never);
    const result = await createChief(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("允许部署", "", "/repo", undefined);

    expect(result.cost).toBe(0.004);
    expect(result.modelUsed).toBe("security/audit");
  });
});

describe("createChiefMerger", () => {
  it("requests security-audit and merges add suggestions", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: "现有规则\n新增规则" }],
    } as never);
    const result = await createChiefMerger(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]);

    expect(defaultSecurityAuditRunner.run).toHaveBeenCalledWith(
      "security-audit",
      modelClient,
      expect.any(Function),
    );
    expect(result.mergedText).toBe("现有规则\n新增规则");
    expect(result.modelUsed).toBe("security/audit");
  });

  it("returns merged content from security-audit", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: "merged" }],
    } as never);
    const result = await createChiefMerger(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]);

    expect(result.error).toBeUndefined();
  });

  it("formats all operation types in the merge prompt", async () => {
    let capturedContext: unknown;
    completeModel.mockImplementation((_model, context) => {
      capturedContext = context;
      return Promise.resolve({
        content: [{ type: "text", text: "merged content" }],
      } as never);
    });
    await createChiefMerger(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("规则A\n规则B\n规则C", [
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
    ]);

    const context = capturedContext as { messages: Array<{ content: string }> };
    const message = context.messages[0].content;
    expect(message).toContain("[新增] 新规则X");
    expect(message).toContain("[删除] 规则B");
    expect(message).toContain('[改写] "规则A" → "规则A改"');
    expect(message).toContain('[合并] "规则C" + "规则D" → "规则CD合并"');
  });

  it("returns a clear error without a merge when security-audit fails", async () => {
    const result = await createChiefMerger(
      modelClient,
      createFailedSecurityAuditRunner("no usable candidate"),
    )("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]);

    expect(result.error).toContain("no usable candidate");
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("returns errors for empty content and call failure", async () => {
    const merger = createChiefMerger(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    );
    completeModel.mockResolvedValue({ content: [] } as never);
    await expect(
      merger("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]),
    ).resolves.toMatchObject({ error: expect.stringContaining("空内容") });

    completeModel.mockRejectedValue(new Error("timeout"));
    await expect(
      merger("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]),
    ).resolves.toMatchObject({ error: expect.stringContaining("调用失败") });
  });

  it("captures cost from merge response", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: "merged" }],
      usage: { cost: { total: 0.002 } },
    } as never);
    const result = await createChiefMerger(
      modelClient,
      defaultSecurityAuditRunner.modelRunner,
    )("现有规则", [{ type: "add", rule: "新增规则", reason: "遗漏" }]);

    expect(result.cost).toBe(0.002);
  });
});
