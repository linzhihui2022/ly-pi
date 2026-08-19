import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestSessionTitle } from "./title";

vi.mock("@earendil-works/pi-ai", () => ({
  completeSimple: vi.fn(),
}));

const completeSimpleMock = vi.mocked(completeSimple);

function createContext(options?: { model?: unknown; auth?: unknown }) {
  const model =
    options && "model" in options
      ? options.model
      : { provider: "deepseek", id: "deepseek-v4-flash" };
  return {
    model,
    modelRegistry: {
      find: vi.fn(() => model),
      getApiKeyAndHeaders: vi.fn(
        async () =>
          options?.auth ?? {
            ok: true as const,
            apiKey: "test-key",
            headers: { "x-test": "header" },
          },
      ),
    },
  } as unknown as ExtensionContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestSessionTitle", () => {
  it("requests a short title from the dedicated model", async () => {
    completeSimpleMock.mockResolvedValue({
      content: [{ type: "text", text: '"重构认证模块"' }],
    } as never);
    const ctx = createContext();

    await expect(requestSessionTitle("请重构认证模块", ctx)).resolves.toBe(
      "重构认证模块",
    );
    expect(ctx.modelRegistry.find).toHaveBeenCalledWith(
      "deepseek",
      "deepseek-v4-flash",
    );
    expect(completeSimpleMock).toHaveBeenCalledWith(
      ctx.model,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: "请重构认证模块",
          }),
        ],
      }),
      expect.objectContaining({
        apiKey: "test-key",
        headers: { "x-test": "header" },
        maxRetries: 0,
        maxTokens: 32,
        timeoutMs: 10_000,
      }),
    );
  });

  it("returns null when the title model is unavailable", async () => {
    const ctx = createContext({ model: undefined });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
    expect(completeSimpleMock).not.toHaveBeenCalled();
  });

  it("returns null when the title model has no credentials", async () => {
    const ctx = createContext({ auth: { ok: false, error: "missing key" } });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
    expect(completeSimpleMock).not.toHaveBeenCalled();
  });

  it("returns null for invalid output or a failed request", async () => {
    const ctx = createContext();
    completeSimpleMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "第一行\n第二行" }],
    } as never);
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();

    completeSimpleMock.mockRejectedValueOnce(new Error("network"));
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
  });

  it("ignores non-text assistant content", async () => {
    const ctx = createContext();
    completeSimpleMock.mockResolvedValueOnce({ content: undefined } as never);
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();

    completeSimpleMock.mockResolvedValueOnce({
      content: [
        null,
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: 123 },
      ],
    } as never);
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
  });
});
