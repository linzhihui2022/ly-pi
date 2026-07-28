import { describe, expect, it } from "vitest";
import { resolveExtDir } from "./ext-dir";

describe("resolveExtDir", () => {
  it("returns the directory of the calling file from import.meta.url", () => {
    const dir = resolveExtDir(import.meta);
    expect(dir).toContain("shared");
    expect(dir).not.toContain("file://");
    expect(dir).toMatch(/^\//);
  });

  it("falls back to process.cwd() when import.meta.url cannot be converted", () => {
    const bad = { url: "https://example.com/index.js" } as ImportMeta;
    expect(resolveExtDir(bad)).toBe(process.cwd());
  });

  it("falls back to process.cwd() when importMeta is missing", () => {
    expect(resolveExtDir()).toBe(process.cwd());
  });
});
