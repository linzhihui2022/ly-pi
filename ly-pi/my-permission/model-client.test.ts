import { describe, expect, it, vi } from "vitest";
import { config } from "./config";
import { auditBinding, createModelClient } from "./model-client";

describe("createModelClient", () => {
  it("forwards lookups to the context model registry", () => {
    const find = vi.fn(() => "resolved-model");
    const ctx = { modelRegistry: { find, complete: vi.fn() } };

    const client = createModelClient(ctx as never);

    expect(client.find("openai", "gpt-4o")).toBe("resolved-model");
    expect(find).toHaveBeenCalledWith("openai", "gpt-4o");
  });

  it("forwards completions to the context model registry", async () => {
    const complete = vi.fn(async () => "completion");
    const ctx = { modelRegistry: { find: vi.fn(), complete } };

    const client = createModelClient(ctx as never);
    const result = await client.complete(
      "model" as never,
      [] as never,
      {} as never,
    );

    expect(result).toBe("completion");
    expect(complete).toHaveBeenCalledWith("model", [], {});
  });
});

describe("auditBinding", () => {
  it("uses the configured audit model and thinking level", () => {
    expect(auditBinding).toEqual({
      model: config.auditModel,
      thinking: config.auditThinking,
    });
  });
});
