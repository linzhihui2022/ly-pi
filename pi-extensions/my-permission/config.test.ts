import { describe, expect, it, afterAll } from "vitest";
import { loadConfig } from "./config";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

const tmp = join(import.meta.dirname, "tmp-config-test");

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when file is missing", async () => {
    const cfg = await loadConfig(join(tmp, "missing.json"));
    expect(cfg.defaultPolicy).toBe("ask");
    expect(cfg.judgeModel).toBe("deepseek/deepseek-v4-flash");
    expect(cfg.judgeTimeoutMs).toBe(8000);
    expect(cfg.childPolicy).toBe("deny-on-unsafe");
  });

  it("merges provided values", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "cfg.json");
    await writeFile(path, JSON.stringify({ defaultPolicy: "deny", judgeTimeoutMs: 3000 }));
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("deny");
    expect(cfg.judgeTimeoutMs).toBe(3000);
    expect(cfg.judgeModel).toBe("deepseek/deepseek-v4-flash");
  });

  it("falls back on invalid JSON", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "bad.json");
    await writeFile(path, "not json");
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
  });

  it("uses defaults when parsed JSON is not an object (string)", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "not-object.json");
    await writeFile(path, '"just a string"');
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
  });

  it("uses defaults when parsed JSON is null", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "null.json");
    await writeFile(path, "null");
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
  });

  it("accepts childPolicy allow-on-safe", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "child.json");
    await writeFile(path, JSON.stringify({ childPolicy: "allow-on-safe" }));
    const cfg = await loadConfig(path);
    expect(cfg.childPolicy).toBe("allow-on-safe");
  });

  it("uses default childPolicy for unknown value", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "unknown-child.json");
    await writeFile(path, JSON.stringify({ childPolicy: "auto" }));
    const cfg = await loadConfig(path);
    expect(cfg.childPolicy).toBe("deny-on-unsafe");
  });

  it("accepts custom judgeModel", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "model.json");
    await writeFile(path, JSON.stringify({ judgeModel: "anthropic/claude-haiku" }));
    const cfg = await loadConfig(path);
    expect(cfg.judgeModel).toBe("anthropic/claude-haiku");
  });

  it("falls back defaultPolicy for invalid value", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "bad-default.json");
    await writeFile(path, JSON.stringify({ defaultPolicy: "maybe" }));
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
  });

  it("accepts custom permission object", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "perm.json");
    await writeFile(path, JSON.stringify({ permission: { read: "allow" } }));
    const cfg = await loadConfig(path);
    expect(cfg.permission).toEqual({ read: "allow" });
  });

  it("rejects permission array, falls back to empty object", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "perm-array.json");
    await writeFile(path, JSON.stringify({ permission: ["read", "write"] }));
    const cfg = await loadConfig(path);
    expect(cfg.permission).toEqual({});
  });

  it("rejects negative judgeTimeoutMs", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "neg-timeout.json");
    await writeFile(path, JSON.stringify({ judgeTimeoutMs: -100 }));
    const cfg = await loadConfig(path);
    expect(cfg.judgeTimeoutMs).toBe(8000);
  });

  it("rejects NaN judgeTimeoutMs", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "nan-timeout.json");
    await writeFile(path, JSON.stringify({ judgeTimeoutMs: NaN }));
    const cfg = await loadConfig(path);
    expect(cfg.judgeTimeoutMs).toBe(8000);
  });

  it("rejects Infinity judgeTimeoutMs", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "inf-timeout.json");
    await writeFile(path, JSON.stringify({ judgeTimeoutMs: Infinity }));
    const cfg = await loadConfig(path);
    expect(cfg.judgeTimeoutMs).toBe(8000);
  });

  it("explicitly accepts childPolicy deny-on-unsafe", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "child-deny.json");
    await writeFile(path, JSON.stringify({ childPolicy: "deny-on-unsafe" }));
    const cfg = await loadConfig(path);
    expect(cfg.childPolicy).toBe("deny-on-unsafe");
  });

  it("returns a fresh object each call (not default ref)", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "fresh.json");
    await writeFile(path, JSON.stringify({ defaultPolicy: "deny" }));
    const wanted = await loadConfig(join(tmp, "missing.json"));
    const got = await loadConfig(path);
    // Mutating got should never affect "wanted"
    got.defaultPolicy = "ask" as const;
    expect(wanted.defaultPolicy).toBe("ask");
  });

  it("returns fresh config per fallback call", async () => {
    await mkdir(tmp, { recursive: true });
    const first = await loadConfig(join(tmp, "missing.json"));
    const second = await loadConfig(join(tmp, "missing2.json"));
    first.judgeModel = "custom/local";
    expect(second.judgeModel).toBe("deepseek/deepseek-v4-flash");
  });

  it("rejects parsed JSON array, uses defaults", async () => {
    await mkdir(tmp, { recursive: true });
    const path = join(tmp, "array-root.json");
    await writeFile(path, JSON.stringify(["a", "b"]));
    const cfg = await loadConfig(path);
    expect(cfg.defaultPolicy).toBe("ask");
    expect(cfg.judgeTimeoutMs).toBe(8000);
  });
});
