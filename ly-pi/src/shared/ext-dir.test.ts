import { afterEach, describe, expect, it } from "vitest";
import { resolveExtDir } from "./ext-dir";

const g = globalThis as Record<string, unknown>;

describe("resolveExtDir", () => {
  afterEach(() => {
    delete g.__PI_TEST_SKIP_DIRNAME;
  });

  it("returns the directory of the calling file from import.meta.url", () => {
    const dir = resolveExtDir(import.meta);
    expect(dir).toContain("shared");
    expect(dir).not.toContain("file://");
    expect(dir).toMatch(/^\//);
  });

  it("falls back to __dirname via eval when import.meta.url cannot be converted", () => {
    const bad = { url: "https://example.com/index.js" } as ImportMeta;
    const dir = resolveExtDir(bad);
    expect(dir).toContain("shared");
  });

  it("falls back to __dirname via eval when importMeta is missing", () => {
    const dir = resolveExtDir();
    expect(dir).toContain("shared");
  });

  it("falls back to process.cwd() when both import.meta and __dirname fail", () => {
    g.__PI_TEST_SKIP_DIRNAME = true;
    const bad = { url: "https://example.com/index.js" } as ImportMeta;
    expect(resolveExtDir(bad)).toBe(process.cwd());
  });

  it("falls back to process.cwd() when importMeta is missing and __dirname is skipped", () => {
    g.__PI_TEST_SKIP_DIRNAME = true;
    expect(resolveExtDir()).toBe(process.cwd());
  });
});
