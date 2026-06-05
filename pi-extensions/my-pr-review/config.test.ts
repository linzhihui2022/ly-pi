import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, defaultConfig } from "./config";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  const testDir = join(tmpdir(), "my-pr-review-test-" + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns default config when file not found", () => {
    const config = loadConfig(join(testDir, "nonexistent.json"));
    expect(config.enabled).toBe(true);
    expect(config.ghCli).toBe("gh");
    expect(config.worktree.enabled).toBe(true);
  });

  it("loads and merges custom config", () => {
    const configPath = join(testDir, "my-pr-review.json");
    writeFileSync(configPath, JSON.stringify({ enabled: false, ghCli: "gh" }));
    const config = loadConfig(configPath);
    expect(config.enabled).toBe(false);
    expect(config.ghCli).toBe("gh");
    expect(config.worktree.enabled).toBe(true); // from default
  });

  it("throws on invalid JSON", () => {
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, "not json");
    expect(() => loadConfig(configPath)).toThrow();
  });
});
