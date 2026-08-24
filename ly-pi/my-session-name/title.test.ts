import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelPolicyRegistry } from "../model-policy/config";
import { requestSessionTitle } from "./title";

vi.mock("../model-policy/config", () => ({
  loadModelPolicyRegistry: vi.fn(),
}));

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

function createRegistry(
  model: unknown,
  available = true,
  thinking: "off" | "max" = "off",
) {
  const run = vi.fn(
    async (
      _role: string,
      _models: unknown,
      operation: (model: unknown, candidate: unknown) => Promise<unknown>,
    ) => {
      if (!available) {
        return {
          status: "failure",
          failurePolicy: "skip",
          reason: "no usable candidate",
        };
      }
      const candidate = {
        slot: "primary",
        model: "test/fast",
        label: "Fast label",
        thinking,
        source: "manifest" as const,
      };
      return {
        status: "success",
        value: await operation(model, candidate),
        candidate,
      };
    },
  );
  return { registry: { run } as any, run };
}

beforeEach(() => {
  completeModel.mockReset();
  vi.mocked(loadModelPolicyRegistry).mockReset();
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

  it("uses the selected fast candidate thinking", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: "任务标题" }],
    });
    const ctx = createContext();
    const { registry } = createRegistry(ctx.model, true, "max");

    await expect(requestSessionTitle("任务", ctx, registry)).resolves.toBe(
      "任务标题",
    );
    expect(completeModel).toHaveBeenCalledWith(
      ctx.model,
      expect.any(Object),
      expect.objectContaining({ reasoningEffort: "max" }),
    );
  });

  it("surfaces an invalid model policy configuration", async () => {
    vi.mocked(loadModelPolicyRegistry).mockImplementation(() => {
      throw new Error("invalid manifest");
    });

    await expect(requestSessionTitle("任务", createContext())).rejects.toThrow(
      "invalid manifest",
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

  it("rejects an unexpected fast Role failure policy", async () => {
    const registry = {
      run: vi.fn(async () => ({
        status: "failure" as const,
        failurePolicy: "error" as const,
        reason: "no usable candidate",
      })),
    } as any;

    await expect(
      requestSessionTitle("任务", createContext(), registry),
    ).rejects.toThrow(
      "fast Role requires 'skip' failure policy, received 'error'",
    );
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

  it("returns null for invalid output", async () => {
    const ctx = createContext();
    const { registry } = createRegistry(ctx.model);
    completeModel.mockResolvedValueOnce({
      content: [{ type: "text", text: "第一行\n第二行" }],
    });
    await expect(
      requestSessionTitle("任务", ctx, registry),
    ).resolves.toBeNull();
  });

  it("does not hide an unexpected Registry exception", async () => {
    const registry = {
      run: vi.fn().mockRejectedValue(new Error("registry failure")),
    } as any;

    await expect(
      requestSessionTitle("任务", createContext(), registry),
    ).rejects.toThrow("registry failure");
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
