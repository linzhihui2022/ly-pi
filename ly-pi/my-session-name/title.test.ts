import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestSessionTitle } from "./title";

const completeModel = vi.fn();
const LUNA = { provider: "openai-codex", id: "gpt-5.6-luna" };

function createContext(options?: { model?: unknown; find?: unknown }) {
  const model = options?.model ?? LUNA;
  return {
    model: { provider: "parent", id: "selected" },
    modelRegistry: {
      find: options?.find ?? vi.fn(() => model),
      complete: completeModel,
    },
  } as unknown as ExtensionContext;
}

beforeEach(() => {
  completeModel.mockReset();
});

describe("requestSessionTitle", () => {
  it("uses the Luna Direct Model Binding without reasoning effort", async () => {
    completeModel.mockResolvedValue({
      content: [{ type: "text", text: '"重构认证模块"' }],
    });
    const find = vi.fn(() => LUNA);
    const ctx = createContext({ find });

    await expect(requestSessionTitle("请重构认证模块", ctx)).resolves.toBe(
      "重构认证模块",
    );

    expect(find).toHaveBeenCalledWith("openai-codex", "gpt-5.6-luna");
    expect(completeModel).toHaveBeenCalledWith(
      LUNA,
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
    expect(completeModel.mock.calls[0]?.[2]).not.toHaveProperty(
      "reasoningEffort",
    );
  });

  it("keeps the session unnamed when the Luna binding is unavailable", async () => {
    const ctx = createContext({ find: vi.fn(() => undefined) });

    await expect(requestSessionTitle("任务", ctx)).resolves.toBeNull();
    expect(completeModel).not.toHaveBeenCalled();
  });

  it("keeps the session unnamed when the Luna request fails", async () => {
    completeModel.mockRejectedValue(new Error("missing key"));

    await expect(
      requestSessionTitle("任务", createContext()),
    ).resolves.toBeNull();
  });

  it("keeps the session unnamed for invalid model output", async () => {
    completeModel.mockResolvedValueOnce({ content: undefined });
    await expect(
      requestSessionTitle("任务", createContext()),
    ).resolves.toBeNull();

    completeModel.mockResolvedValueOnce({
      content: [{ type: "text", text: "第一行\n第二行" }],
    });
    await expect(
      requestSessionTitle("任务", createContext()),
    ).resolves.toBeNull();
  });
});
