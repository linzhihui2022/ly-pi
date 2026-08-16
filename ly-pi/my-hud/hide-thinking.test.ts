/**
 * Tests for hide-thinking.ts — reads pi's hideThinkingBlock setting from
 * ~/.pi/agent/settings.json with an mtime cache.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from "node:fs";

let dir: string;
let settingsPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "my-hud-hide-thinking-"));
  settingsPath = join(dir, "settings.json");
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Load the module fresh so the module-level mtime cache starts empty. */
async function loadModule() {
  vi.resetModules();
  return await import("./hide-thinking");
}

describe("getHideThinking", () => {
  it("returns true when hideThinkingBlock is true", async () => {
    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: true }));
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(true);
  });

  it("returns false when hideThinkingBlock is false", async () => {
    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: false }));
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(false);
  });

  it("returns false when the key is absent", async () => {
    writeFileSync(settingsPath, JSON.stringify({ defaultModel: "x" }));
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(false);
  });

  it("returns false when the settings file is missing", async () => {
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(false);
  });

  it("returns false on invalid JSON", async () => {
    writeFileSync(settingsPath, "{not json");
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(false);
  });

  it("caches by mtime — re-reads the file only when mtime changes", async () => {
    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: true }));
    const { getHideThinking } = await loadModule();

    getHideThinking(settingsPath); // stat + read
    getHideThinking(settingsPath); // cache hit
    getHideThinking(settingsPath); // cache hit

    expect(readFileSync).toHaveBeenCalledTimes(1);
    expect(getHideThinking(settingsPath)).toBe(true);
  });

  it("re-reads when mtime changes", async () => {
    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: true }));
    const { getHideThinking } = await loadModule();
    expect(getHideThinking(settingsPath)).toBe(true);

    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: false }));
    expect(getHideThinking(settingsPath)).toBe(false);
  });

  it("does not share the cache across different paths", async () => {
    const otherPath = join(dir, "other-settings.json");
    writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: true }));
    writeFileSync(otherPath, JSON.stringify({ hideThinkingBlock: false }));
    const { getHideThinking } = await loadModule();

    expect(getHideThinking(settingsPath)).toBe(true);
    expect(getHideThinking(otherPath)).toBe(false);
    expect(getHideThinking(settingsPath)).toBe(true);
  });
});
