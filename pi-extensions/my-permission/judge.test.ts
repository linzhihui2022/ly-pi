import { describe, expect, it, vi } from "vitest";
import { createJudge } from "./judge";
import type { ModelRuntime, Model } from "@earendil-works/pi-coding-agent";
import type { Config } from "./types";

function makeModel(overrides: Partial<{ id: string; provider: string }> = {}): Model {
  return {
    id: overrides.id ?? "test-model",
    provider: overrides.provider ?? "deepseek",
    name: "Test Model",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  } as Model;
}

const resolvedModel = makeModel({ id: "deepseek-v4-flash", provider: "deepseek" });

function mockRuntime(
  completeValue: unknown,
  opts?: { getModelReturns?: Model | undefined; findReturns?: Model | undefined },
): ModelRuntime {
  return {
    getModel: vi.fn().mockReturnValue(
      opts && "getModelReturns" in opts ? opts.getModelReturns : resolvedModel,
    ),
    find: vi.fn().mockReturnValue(
      opts && "findReturns" in opts ? opts.findReturns : undefined,
    ),
    complete: vi.fn().mockResolvedValue(completeValue),
  } as unknown as ModelRuntime;
}

const config: Config = {
  defaultPolicy: "ask",
  judgeModel: "deepseek/deepseek-v4-flash",
  judgeTimeoutMs: 5000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const input = { toolName: "read", value: "src/main.ts", paths: [] };

describe("createJudge", () => {
  it("returns safe result when model says safe", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"safe":true,"reason":"read only","toolFor":"read file"}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(
      input,
      "/repo",
      undefined,
    );
    expect(result).toEqual({
      safe: true,
      reason: "read only",
      toolFor: "read file",
    });
  });

  it("returns unsafe result when model says unsafe", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"safe":false,"reason":"destructive","toolFor":"delete files"}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(
      { toolName: "bash", value: "rm -rf /", paths: [] },
      "/repo",
      undefined,
    );
    expect(result).toEqual({
      safe: false,
      reason: "destructive",
      toolFor: "delete files",
    });
  });

  it("returns undefined on invalid JSON", async () => {
    const runtime = mockRuntime({
      content: [{ type: "text", text: "not json" }],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(
      { toolName: "bash", value: "rm -rf /", paths: [] },
      "/repo",
      undefined,
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when model response has no text content", async () => {
    const runtime = mockRuntime({ content: [] });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when JSON is missing 'safe' field", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"reason":"ok","toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when 'safe' is not a boolean", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"safe":"yes","reason":"ok","toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when 'reason' is not a string", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"safe":true,"reason":42,"toolFor":"do stuff"}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when 'toolFor' is not a string", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '{"safe":true,"reason":"ok","toolFor":123}',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined on runtime.complete throwing", async () => {
    const runtime = {
      getModel: vi.fn().mockReturnValue(resolvedModel),
      find: vi.fn().mockReturnValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error("network error")),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when model resolution fails (no getModel result, no find result, no fallback)", async () => {
    const runtime = {
      getModel: vi.fn().mockReturnValue(undefined),
      find: vi.fn().mockReturnValue(undefined),
      complete: vi.fn(),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("uses fallbackModel when primary resolution fails", async () => {
    const fallback = makeModel({ id: "fallback-model", provider: "openai" });
    const runtime = {
      getModel: vi.fn().mockReturnValue(undefined),
      find: vi.fn().mockReturnValue(undefined),
      complete: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"safe":true,"reason":"fallback ok","toolFor":"read"}',
          },
        ],
      }),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", fallback);
    expect(result).toEqual({
      safe: true,
      reason: "fallback ok",
      toolFor: "read",
    });
  });

  it("resolves model via getModel", async () => {
    const runtime = mockRuntime(
      {
        content: [
          {
            type: "text",
            text: '{"safe":true,"reason":"ok","toolFor":"read"}',
          },
        ],
      },
      { getModelReturns: resolvedModel },
    );
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeDefined();
    expect(runtime.getModel).toHaveBeenCalled();
  });

  it("resolves model via find when getModel returns undefined", async () => {
    const runtime = mockRuntime(
      {
        content: [
          {
            type: "text",
            text: '{"safe":true,"reason":"ok","toolFor":"read"}',
          },
        ],
      },
      { getModelReturns: undefined, findReturns: resolvedModel },
    );
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeDefined();
  });

  it("parses JSON wrapped in markdown code fence", async () => {
    const runtime = mockRuntime({
      content: [
        {
          type: "text",
          text: '```json\n{"safe":true,"reason":"ok","toolFor":"do stuff"}\n```',
        },
      ],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toEqual({
      safe: true,
      reason: "ok",
      toolFor: "do stuff",
    });
  });

  it("passes through the prompt with correct cwd, toolName, and value", async () => {
    let capturedContext: unknown;
    const runtime = {
      getModel: vi.fn().mockReturnValue(resolvedModel),
      find: vi.fn().mockReturnValue(undefined),
      complete: vi.fn().mockImplementation((_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({
          content: [
            {
              type: "text",
              text: '{"safe":true,"reason":"ok","toolFor":"do"}',
            },
          ],
        });
      }),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtime, config);
    await judge({ toolName: "bash", value: "rm file", paths: [] }, "/my-project", undefined);
    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("/my-project");
    expect(msg).toContain("bash");
    expect(msg).toContain("rm file");
  });

  it("returns undefined when JSON.parse throws (has braces but not valid JSON)", async () => {
    const runtime = mockRuntime({
      content: [{ type: "text", text: "{not valid json}" }],
    });
    const judge = createJudge(runtime, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined on runtime that has no find method (optional chaining fallback)", async () => {
    // When find is literally absent, resolveModel should still work via getModel
    const runtimeWithGetOnly = {
      getModel: vi.fn().mockReturnValue(undefined),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtimeWithGetOnly, config);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when judgeModel has no provider separator", async () => {
    // Single-word model that cannot be split into provider/id
    const noSlashConfig: Config = { ...config, judgeModel: "some-model" };
    const runtime = {
      getModel: vi.fn(),
      complete: vi.fn(),
    } as unknown as ModelRuntime;
    const judge = createJudge(runtime, noSlashConfig);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });

  it("aborts after config.judgeTimeoutMs", async () => {
    const runtime = {
      getModel: vi.fn().mockReturnValue(resolvedModel),
      find: vi.fn().mockReturnValue(undefined),
      complete: vi.fn().mockImplementation(
        (_model: unknown, _context: unknown, opts?: { signal?: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          });
        },
      ),
    } as unknown as ModelRuntime;
    const shortTimeoutConfig: Config = { ...config, judgeTimeoutMs: 10 };
    const judge = createJudge(runtime, shortTimeoutConfig);
    const result = await judge(input, "/repo", undefined);
    expect(result).toBeUndefined();
  });
});
