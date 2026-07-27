import { describe, expect, it, vi } from "vitest";
import { createAuthResolver } from "./auth";

describe("createAuthResolver", () => {
  it("returns undefined when getApiKeyAndHeaders is not a function", async () => {
    const resolve = createAuthResolver(undefined);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result).toBeUndefined();
  });

  it("returns auth when getApiKeyAndHeaders returns ok:true", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      apiKey: "key-123",
      headers: { "X-Custom": "val" },
    });
    const resolve = createAuthResolver(mock);
    const model = { provider: "x", id: "y" } as never;
    const result = await resolve(model);
    expect(result).toEqual({
      apiKey: "key-123",
      headers: { "X-Custom": "val" },
    });
    expect(mock).toHaveBeenCalledWith(model);
  });

  it("returns undefined when getApiKeyAndHeaders returns ok:false", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: false,
      apiKey: "key-123",
    });
    const resolve = createAuthResolver(mock);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result).toBeUndefined();
  });
});
