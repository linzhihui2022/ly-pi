import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestSessionTitle } from "./title";

const completeModel = vi.fn();

function createContext(options?: { model?: unknown }) {
  const model =
    options && "model" in options
      ? options.model
      : { provider: "deepseek", id: "deepseek-v4-flash" };
  return {
    model,
    modelRegistry: {
      find: vi.fn(() => model),
      complete: completeModel,
    },
  } as unknown as ExtensionContext;
}

beforeEach(() => {
  completeModel.mockReset();
});

describe("requestSessionTitle", () => {
  it("requests a short title from the dedicated model", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: '"重构认证模块"' }],
    });
    const ctx = createContext();

    await expect(requestSessionTitle("请重构认证模块", ctx)).resolves.toBe(
      "重构认证模块",
    );
    expect(ctx.modelRegistry.find).toHaveBeenCalledWith(
      "deepseek",
      "deepseek-v4-flash",
    );
    expect(completeModel).toHaveBeenCalledWith(
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
        maxRetries: 0,
        maxTokens: 32,
        timeoutMs: 10_000,
      }),
    );
  });

  it("returns null when the title model is unavailable", async () => {
    const ctx = createContext({ model: undefined });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("returns null when the model reports an auth error", async () => {
    completeModel.mockResolvedValue({
      content: [],
      stopReason: "error",
      errorMessage: "missing key",
    });
    const ctx = createContext();

    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
  });

  it("returns null for invalid output or a failed request", async () => {
    const ctx = createContext();
    completeModel.mockResolvedValueOnce({
      content: [{ type: "text", text: "第一行\n第二行" }],
    });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();

    completeModel.mockRejectedValueOnce(new Error("network"));
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
  });

  it("ignores non-text assistant content", async () => {
    const ctx = createContext();
    completeModel.mockResolvedValueOnce({ content: undefined });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();

    completeModel.mockResolvedValueOnce({
      content: [
        null,
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: 123 },
      ],
    });
    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
  });
});
