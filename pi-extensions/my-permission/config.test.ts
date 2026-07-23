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
});
