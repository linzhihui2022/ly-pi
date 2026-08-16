import { describe, expect, it, vi } from "vitest";
import { createAuthResolver, createAuthResolverWithFallback } from "./auth";

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

  it("forwards provider-scoped env when present", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      apiKey: "key-123",
      env: { DEEPSEEK_API_KEY: "key-123" },
    });
    const resolve = createAuthResolver(mock);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result).toEqual({
      apiKey: "key-123",
      headers: undefined,
      env: { DEEPSEEK_API_KEY: "key-123" },
    });
  });
});

describe("createAuthResolverWithFallback", () => {
  it("returns standard auth without touching the fallback when an apiKey exists", async () => {
    const standard = vi.fn().mockResolvedValue({ ok: true, apiKey: "key-1" });
    const fallback = vi.fn().mockResolvedValue("key-2");
    const resolve = createAuthResolverWithFallback(standard, fallback);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result?.apiKey).toBe("key-1");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to the credential store when standard auth is unavailable", async () => {
    const fallback = vi.fn().mockResolvedValue("key-2");
    const resolve = createAuthResolverWithFallback(undefined, fallback);
    const result = await resolve({ provider: "deepseek", id: "y" } as never);
    expect(result).toEqual({ apiKey: "key-2" });
    expect(fallback).toHaveBeenCalledWith("deepseek");
  });

  it("falls back when standard auth is ok but carries no apiKey", async () => {
    const standard = vi.fn().mockResolvedValue({ ok: true });
    const fallback = vi.fn().mockResolvedValue("key-2");
    const resolve = createAuthResolverWithFallback(standard, fallback);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result).toEqual({ apiKey: "key-2" });
  });

  it("returns undefined when neither source has credentials", async () => {
    const fallback = vi.fn().mockResolvedValue(undefined);
    const resolve = createAuthResolverWithFallback(undefined, fallback);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result).toBeUndefined();
  });

  it("returns the standard result when it lacks an apiKey and the fallback misses too", async () => {
    const standard = vi
      .fn()
      .mockResolvedValue({ ok: true, headers: { "X-Auth": "session" } });
    const fallback = vi.fn().mockResolvedValue(undefined);
    const resolve = createAuthResolverWithFallback(standard, fallback);
    const result = await resolve({ provider: "x", id: "y" } as never);
    expect(result?.headers).toEqual({ "X-Auth": "session" });
    expect(result?.apiKey).toBeUndefined();
  });
});
