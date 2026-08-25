import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadHudConfig } from "./config";

describe("loadHudConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "my-hud-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty hidden fields when config is missing or invalid", () => {
    expect(loadHudConfig(dir)).toEqual({ hiddenFields: [] });

    writeFileSync(join(dir, "my-hud.json"), "{ not json");
    expect(loadHudConfig(dir)).toEqual({ hiddenFields: [] });

    writeFileSync(join(dir, "my-hud.json"), JSON.stringify(null));
    expect(loadHudConfig(dir)).toEqual({ hiddenFields: [] });
  });

  it("returns hidden fields from my-hud.json", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ hiddenFields: ["cost", "cacheRate"] }),
    );

    expect(loadHudConfig(dir)).toEqual({
      hiddenFields: ["cost", "cacheRate"],
    });
  });

  it("ignores an invalid hidden fields value", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ hiddenFields: ["cost", 3] }),
    );

    expect(loadHudConfig(dir)).toEqual({ hiddenFields: [] });
  });
});
