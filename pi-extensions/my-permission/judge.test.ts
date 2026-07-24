import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createJudge } from "./judge";
import type { Config } from "./types";

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    complete: vi.fn(),
  };
});

function makeModel(overrides: Partial<{ id: string; provider: string }> = {}): Model<Api> {
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

const input = { toolName: "read", value: "src/main.ts", paths: [] };
const resolveModelOk = () => resolvedModel;
const resolveModelNotFound = () => undefined;
const resolveFnOk = vi.fn(resolveModelOk);
const resolveFnNotFound = vi.fn(resolveModelNotFound);

async function mockComplete(value: unknown): Promise<void> {
  const { complete } = await import("@earendil-works/pi-ai");
  (complete as ReturnType<typeof vi.fn>).mockResolvedValue(value);
}

describe("createJudge", () => {
  it("returns safe result when model says safe", async () => {
    await mockComplete({
      content: [{ type: "text", text: '{"safe":true,"reason":"read only","toolFor":"read file"}' }],
    });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual({ safe: true, reason: "read only", toolFor: "read file" });
  });

  it("returns unsafe result when model says unsafe", async () => {
    await mockComplete({
      content: [{ type: "text", text: '{"safe":false,"reason":"destructive","toolFor":"delete files"}' }],
    });
    const judge = createJudge(config);
    const result = await judge({ toolName: "bash", value: "rm -rf /", paths: [] }, "/repo", undefined, resolveFnOk);
    expect(result).toEqual({ safe: false, reason: "destructive", toolFor: "delete files" });
  });

  it("returns undefined on invalid JSON", async () => {
    await mockComplete({ content: [{ type: "text", text: "not json" }] });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined when model response has no text content", async () => {
    await mockComplete({ content: [] });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined when JSON is missing 'safe' field", async () => {
    await mockComplete({ content: [{ type: "text", text: '{"reason":"ok","toolFor":"do stuff"}' }] });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined when 'reason' is not a string", async () => {
    await mockComplete({ content: [{ type: "text", text: '{"safe":true,"reason":42,"toolFor":"do stuff"}' }] });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined on model call throwing", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined when model resolution fails and no fallback", async () => {
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnNotFound);
    expect(result).toBeUndefined();
  });

  it("uses fallbackModel when primary resolution fails", async () => {
    await mockComplete({ content: [{ type: "text", text: '{"safe":true,"reason":"fallback ok","toolFor":"read"}' }] });
    const fallback = makeModel({ id: "fallback-model", provider: "openai" });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", fallback, resolveFnNotFound);
    expect(result).toEqual({ safe: true, reason: "fallback ok", toolFor: "read" });
  });

  it("parses JSON wrapped in markdown code fence", async () => {
    await mockComplete({
      content: [{ type: "text", text: '```json\n{"safe":true,"reason":"ok","toolFor":"do stuff"}\n```' }],
    });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toEqual({ safe: true, reason: "ok", toolFor: "do stuff" });
  });

  it("passes apiKey and headers from getAuth to complete", async () => {
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, _context: unknown, options?: { apiKey?: string; headers?: Record<string, string> }) =>
        Promise.resolve({ content: [{ type: "text" as const, text: '{"safe":true,"reason":"auth ok","toolFor":"read"}' }] }),
    );
    const judge = createJudge(config, {
      getAuth: async () => ({ apiKey: "deepseek-key", headers: { "X-Custom": "1" } }),
    });
    await judge(input, "/repo", undefined, resolveFnOk);
    const calls = (complete as ReturnType<typeof vi.fn>).mock.calls;
    const options = calls[calls.length - 1][2];
    expect(options).toMatchObject({ apiKey: "deepseek-key", headers: { "X-Custom": "1" } });
  });

  it("builds prompt with correct context", async () => {
    let capturedContext: unknown;
    const { complete } = await import("@earendil-works/pi-ai");
    (complete as ReturnType<typeof vi.fn>).mockImplementation(
      (_model: unknown, context: unknown) => {
        capturedContext = context;
        return Promise.resolve({ content: [{ type: "text" as const, text: '{"safe":true,"reason":"ok","toolFor":"do"}' }] });
      },
    );
    const judge = createJudge(config);
    await judge({ toolName: "bash", value: "rm file", paths: [] }, "/my-project", undefined, resolveFnOk);
    const ctx = capturedContext as { messages: Array<{ content: string }> };
    const msg = ctx.messages[0].content as string;
    expect(msg).toContain("/my-project");
    expect(msg).toContain("bash");
    expect(msg).toContain("rm file");
  });

  it("returns undefined when judgeModel has no provider separator", async () => {
    const noSlashConfig: Config = { ...config, judgeModel: "some-model" };
    const judge = createJudge(noSlashConfig);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("returns undefined when JSON.parse throws on malformed JSON with braces", async () => {
    await mockComplete({
      content: [{ type: "text", text: "{not valid json}" }],
    });
    const judge = createJudge(config);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });

  it("handles timeout by catching abort error", async () => {
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
    const judge = createJudge(shortConfig);
    const result = await judge(input, "/repo", undefined, resolveFnOk);
    expect(result).toBeUndefined();
  });
});
