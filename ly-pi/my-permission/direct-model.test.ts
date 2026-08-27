import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { resolveDirectModel } from "./direct-model";
import type { ModelClient } from "./types";

function makeModel(provider = "openai-codex", id = "gpt-5.6-luna"): Model<Api> {
  return {
    provider,
    id,
    name: "Test model",
    api: "openai-completions",
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
  } as Model<Api>;
}

describe("resolveDirectModel", () => {
  it("resolves a Direct Model Binding by provider and full model id", () => {
    const model = makeModel("provider", "nested/model");
    const find = vi.fn(() => model);
    const client = { find, complete: vi.fn() } as unknown as ModelClient;

    expect(
      resolveDirectModel(client, { model: "provider/nested/model" }),
    ).toEqual({ model, reference: "provider/nested/model" });
    expect(find).toHaveBeenCalledWith("provider", "nested/model");
  });

  it("returns undefined when the directly bound model is unavailable", () => {
    const find = vi.fn(() => undefined);
    const client = { find, complete: vi.fn() } as unknown as ModelClient;

    expect(
      resolveDirectModel(client, { model: "openai-codex/gpt-5.6-luna" }),
    ).toBeUndefined();
  });
});
