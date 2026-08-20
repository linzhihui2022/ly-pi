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

  it("returns modelShortNames from my-hud.json", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ modelShortNames: { "example/model": "short" } }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: { "example/model": "short" },
      hiddenFields: [],
    });
  });

  it("returns empty mapping when file is missing", () => {
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when JSON is corrupt", () => {
    writeFileSync(join(dir, "my-hud.json"), "{ not json");
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when root JSON is null", () => {
    writeFileSync(join(dir, "my-hud.json"), "null");
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when modelShortNames is absent", () => {
    writeFileSync(join(dir, "my-hud.json"), JSON.stringify({}));
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when modelShortNames is not an object", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ modelShortNames: "not-a-map" }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when modelShortNames is an array", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ modelShortNames: ["not-a-map"] }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty mapping when modelShortNames has non-string values", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ modelShortNames: { "example/model": 3 } }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns hiddenFields from my-hud.json", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ hiddenFields: ["cost", "cacheRate"] }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: ["cost", "cacheRate"],
    });
  });

  it("returns empty hiddenFields when it is not an array", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ hiddenFields: "cost" }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });

  it("returns empty hiddenFields when it has non-string entries", () => {
    writeFileSync(
      join(dir, "my-hud.json"),
      JSON.stringify({ hiddenFields: ["cost", 3] }),
    );
    expect(loadHudConfig(dir)).toEqual({
      modelShortNames: {},
      hiddenFields: [],
    });
  });
});
