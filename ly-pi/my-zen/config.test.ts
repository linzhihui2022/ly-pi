import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ZEN_CONFIG,
  loadZenConfig,
  parseZenMode,
  saveZenConfig,
  setToolDisplayOverrides,
} from "./config";

let dir: string;
let configPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "my-zen-test-"));
  configPath = join(dir, "my-zen.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("parseZenMode", () => {
  it("accepts on", () => {
    expect(parseZenMode("on")).toBe("on");
  });

  it("accepts off", () => {
    expect(parseZenMode("off")).toBe("off");
  });

  it("rejects legacy zen value", () => {
    expect(parseZenMode("zen")).toBeUndefined();
  });

  it("rejects removed line mode", () => {
    expect(parseZenMode("line")).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(parseZenMode("invisible")).toBeUndefined();
    expect(parseZenMode("")).toBeUndefined();
  });
});

describe("loadZenConfig", () => {
  it("loads on mode from file", () => {
    writeFileSync(configPath, JSON.stringify({ mode: "on" }));
    expect(loadZenConfig(configPath)).toEqual({ mode: "on" });
  });

  it("loads off mode from file", () => {
    writeFileSync(configPath, JSON.stringify({ mode: "off" }));
    expect(loadZenConfig(configPath)).toEqual({ mode: "off" });
  });

  it("falls back to default when file is missing", () => {
    expect(loadZenConfig(configPath)).toEqual(DEFAULT_ZEN_CONFIG);
  });

  it("falls back to default on invalid JSON", () => {
    writeFileSync(configPath, "not-json{");
    expect(loadZenConfig(configPath)).toEqual(DEFAULT_ZEN_CONFIG);
  });

  it("falls back to default on legacy zen value", () => {
    writeFileSync(configPath, JSON.stringify({ mode: "zen" }));
    expect(loadZenConfig(configPath)).toEqual(DEFAULT_ZEN_CONFIG);
  });
});

describe("saveZenConfig", () => {
  it("writes config that round-trips through load", () => {
    saveZenConfig(configPath, { mode: "off" });
    expect(loadZenConfig(configPath)).toEqual({ mode: "off" });
  });

  it("writes pretty-printed JSON with trailing newline", () => {
    saveZenConfig(configPath, { mode: "on" });
    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toBe(`${JSON.stringify({ mode: "on" }, null, 2)}\n`);
  });
});

describe("setToolDisplayOverrides", () => {
  const baseConfig = {
    debug: false,
    registerToolOverrides: {
      read: false,
      grep: false,
      find: false,
      ls: false,
      bash: false,
      edit: false,
      write: false,
    },
    mcpOutputMode: "hidden",
  };

  it("enables all seven overrides while preserving other keys", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify(baseConfig));
    expect(setToolDisplayOverrides(true, path)).toBe(true);

    const written = JSON.parse(readFileSync(path, "utf-8"));
    expect(written.registerToolOverrides.read).toBe(true);
    expect(written.registerToolOverrides.write).toBe(true);
    expect(Object.keys(written.registerToolOverrides)).toHaveLength(7);
    expect(written.enableNativeUserMessageBox).toBe(true);
    expect(written.mcpOutputMode).toBe("hidden");
    expect(written.debug).toBe(false);
  });

  it("disables all seven overrides", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify(baseConfig));
    expect(setToolDisplayOverrides(false, path)).toBe(true);

    const written = JSON.parse(readFileSync(path, "utf-8"));
    for (const value of Object.values(written.registerToolOverrides)) {
      expect(value).toBe(false);
    }
    expect(written.enableNativeUserMessageBox).toBe(false);
  });

  it("creates the overrides block when missing", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ debug: true }));
    expect(setToolDisplayOverrides(true, path)).toBe(true);

    const written = JSON.parse(readFileSync(path, "utf-8"));
    expect(written.registerToolOverrides.bash).toBe(true);
    expect(written.debug).toBe(true);
  });

  it("returns false when the config file does not exist", () => {
    expect(setToolDisplayOverrides(true, join(dir, "missing.json"))).toBe(
      false,
    );
  });

  it("returns false on invalid JSON without writing", () => {
    const path = join(dir, "broken.json");
    writeFileSync(path, "oops{");
    expect(setToolDisplayOverrides(true, path)).toBe(false);
    expect(readFileSync(path, "utf-8")).toBe("oops{");
  });
});
