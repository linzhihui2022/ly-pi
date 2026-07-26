import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createJudge } from "./judge";
import type { Config } from "./types";

vi.mock("@earendil-works/pi-ai", () => ({
  complete: vi.fn(),
}));

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
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const JUDGE_PROMPT =
  '工作目录：{{cwd}}\n工具：{{toolName}}\n输入：{{toolInput}}\n\n只回复 JSON：{\n  "safe": boolean,\n  "score": number,\n  "reason": "...",\n  "toolFor": "..."\n}\n\n判断标准：只读操作安全，破坏性操作不安全。';

const judgeDeps = { judgePrompt: JUDGE_PROMPT };

const input = { toolName: "read", value: "src/main.ts", paths: [] };
const resolveModelOk = () => resolvedModel;
const resolveModelNotFound = () => undefined;
const resolveFnOk = vi.fn(resolveModelOk);
const resolveFnNotFound = vi.fn(resolveModelNotFound);

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
  const { complete } = await import("@earendil-works/pi-ai");
  (complete as ReturnType<typeof vi.fn>).mockResolvedValue(value);
}

describe("createJudge", () => {
  it("returns safe result when model says safe", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":8,"reason":"read only","toolFor":"read file"}',
        },
      ],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual({
      safe: true,
      score: 8,
      reason: "read only",
      toolFor: "read file",
    });
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
      undefined,
      resolveFnOk,
    );
    expect(result).toEqual({
      safe: false,
      score: 3,
      reason: "destructive",
      toolFor: "delete files",
    });
  });

  it("returns failure result on invalid JSON", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result when model response has no text content", async () => {
    await mockComplete({ content: [] });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
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
    const result = await judge(input, "/repo", undefined, resolveFnOk);
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
    const result = await judge(input, "/repo", undefined, resolveFnOk);
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
    const result = await judge(input, "/repo", undefined, resolveFnOk);
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
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns failure result on model call throwing", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error"),
    );
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型调用失败，请手动确认"),
    );
  });

  it("returns failure result when model resolution fails and no fallback", async () => {
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnNotFound);
    expect(result).toEqual(
      failureReason(input, "未找到可用的法官模型，请手动确认"),
    );
  });

  it("uses fallbackModel when primary resolution fails", async () => {
    await mockComplete({
      content: [
        {
          type: "text",
          text: '{"safe":true,"score":9,"reason":"fallback ok","toolFor":"read"}',
        },
      ],
    });
    const fallback = makeModel({ id: "fallback-model", provider: "openai" });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", fallback, resolveFnNotFound);
    expect(result).toEqual({
      safe: true,
      score: 9,
      reason: "fallback ok",
      toolFor: "read",
    });
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
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual({
      safe: true,
      score: 7,
      reason: "ok",
      toolFor: "do stuff",
    });
  });

  it("passes apiKey and headers from getAuth to complete", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _model: unknown,
        _context: unknown,
        _options?: { apiKey?: string; headers?: Record<string, string> },
      ) =>
        Promise.resolve({
          content: [
            {
              type: "text" as const,
              text: '{"safe":true,"score":8,"reason":"auth ok","toolFor":"read"}',
            },
          ],
        }),
    );
    const judge = createJudge(config, {
      ...judgeDeps,
      getAuth: async () => ({
        apiKey: "deepseek-key",
        headers: { "X-Custom": "1" },
      }),
    });
    await judge(input, "/repo", undefined, resolveFnOk);
    const calls = (complete as ReturnType<typeof vi.fn>).mock.calls;
    const options = calls[calls.length - 1][2];
    expect(options).toMatchObject({
      apiKey: "deepseek-key",
      headers: { "X-Custom": "1" },
    });
  });

  it("proceeds without explicit auth when getAuth resolves undefined", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        content: [
          {
            type: "text" as const,
            text: '{"safe":true,"score":5,"reason":"no auth","toolFor":"read"}',
          },
        ],
      }),
    );
    const judge = createJudge(config, {
      ...judgeDeps,
      getAuth: async () => undefined,
    });
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    const calls = (complete as ReturnType<typeof vi.fn>).mock.calls;
    const options = calls[calls.length - 1][2] as {
      apiKey?: string;
      headers?: Record<string, string>;
    };
    expect(options.apiKey).toBeUndefined();
    expect(options.headers).toBeUndefined();
    expect(result.safe).toBe(true);
  });

  it("builds prompt with correct context", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [
            {
              type: "text" as const,
              text: '{"safe":true,"score":6,"reason":"ok","toolFor":"do"}',
            },
          ],
        });
      },
    );
    const judge = createJudge(config, judgeDeps);
    await judge(
      { toolName: "bash", value: "rm file", paths: [] },
      "/my-project",
      undefined,
      resolveFnOk,
    );
    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("/my-project");
    expect(msg).toContain("bash");
    expect(msg).toContain("rm file");
    expect(msg).toContain('"score": number');
    expect(msg).toContain("判断标准");
  });

  it("returns failure result when judgeModel has no provider separator", async () => {
    const noSlashConfig: Config = { ...config, judgeModel: "some-model" };
    const judge = createJudge(noSlashConfig, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "未找到可用的法官模型，请手动确认"),
    );
  });

  it("returns failure result on malformed JSON with braces", async () => {
    await mockComplete({
      content: [{ type: "text", text: "{not valid json}" }],
    });
    const judge = createJudge(config, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型返回格式不正确，请手动确认"),
    );
  });

  it("returns timeout failure result", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    let abortSignal: AbortSignal | undefined;
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, _context: unknown, opts?: { signal?: AbortSignal }) => {
        abortSignal = opts?.signal;
        // Return a promise that rejects when the signal aborts
        return new Promise((_resolve, reject) => {
          if (abortSignal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          abortSignal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      },
    );

    const shortConfig: Config = { ...config, judgeTimeoutMs: 1 };
    const judge = createJudge(shortConfig, judgeDeps);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual(
      failureReason(input, "法官模型调用超时（1ms），请手动确认"),
    );
  });
});
