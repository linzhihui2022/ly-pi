import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestSessionTitle } from "./title";

const completeModel = vi.fn();

function createContext(options?: { model?: unknown }) {
  const model =
    options && "model" in options
      ? options.model
      : { provider: "test", id: "fast" };
  return {
    model,
    modelRegistry: {
      find: vi.fn(() => model),
      complete: completeModel,
    },
  } as unknown as ExtensionContext;
}

function createRegistry(model: unknown, available = true) {
  const run = vi.fn(
    async (
      _role: string,
      _models: unknown,
      operation: (candidate: unknown) => Promise<unknown>,
    ) => {
      if (!available) {
        return {
          status: "failure",
          failurePolicy: "skip",
          reason: "no usable candidate",
        };
      }
      return {
        status: "success",
        value: await operation(model),
        candidate: {
          slot: "primary",
          model: "test/fast",
          label: "Fast label",
          thinking: "off",
          source: "manifest",
        },
      };
    },
  );
  return { registry: { run } as any, run };
}

beforeEach(() => {
  completeModel.mockReset();
});

describe("requestSessionTitle", () => {
  it("requests a short title through the fast Model Role", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: '"重构认证模块"' }],
    });
    const ctx = createContext();
    const { registry, run } = createRegistry(ctx.model);

    await expect(
      requestSessionTitle("请重构认证模块", ctx, registry),
    ).resolves.toBe("重构认证模块");
    expect(run).toHaveBeenCalledWith(
      "fast",
      ctx.modelRegistry,
      expect.any(Function),
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

  it("keeps the session unnamed when the fast Role has no usable candidate", async () => {
    const ctx = createContext({ model: undefined });
    const { registry, run } = createRegistry(undefined, false);

    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();
    expect(run).toHaveBeenCalledWith(
      "fast",
      ctx.modelRegistry,
      expect.any(Function),
    );
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("returns null when the model reports an auth error", async () => {
    completeModel.mockResolvedValue({
      content: [],
      stopReason: "error",
      errorMessage: "missing key",
    });
    const ctx = createContext();
    const { registry } = createRegistry(ctx.model);

    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();
  });

  it("returns null for invalid output or a failed request", async () => {
    const ctx = createContext();
    const { registry } = createRegistry(ctx.model);
    completeModel.mockResolvedValueOnce({
      content: [{ type: "text", text: "第一行\n第二行" }],
    });
    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();

    completeModel.mockRejectedValueOnce(new Error("network"));
    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();
  });

  it("ignores non-text assistant content", async () => {
    const ctx = createContext();
    const { registry } = createRegistry(ctx.model);
    completeModel.mockResolvedValueOnce({ content: undefined });
    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();

    completeModel.mockResolvedValueOnce({
      content: [
        null,
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: 123 },
      ],
    });
    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();
  });
});
