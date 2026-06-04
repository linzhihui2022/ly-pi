import { describe, it, expect } from "vitest";
import {
  MIN_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS,
  DEFAULT_SEARCH_RESULTS,
  clampSearchResultCount,
  spillFullContentToTempFile,
} from "./helper";
import { readFile } from "node:fs/promises";

describe("clampSearchResultCount", () => {
  it("uses default when undefined", () => {
    expect(clampSearchResultCount(undefined)).toBe(DEFAULT_SEARCH_RESULTS);
  });

  it("uses requested value when within range", () => {
    expect(clampSearchResultCount(3)).toBe(3);
    expect(clampSearchResultCount(7)).toBe(7);
  });

  it("clamps to minimum when below range", () => {
    expect(clampSearchResultCount(0)).toBe(MIN_SEARCH_RESULTS);
    expect(clampSearchResultCount(-1)).toBe(MIN_SEARCH_RESULTS);
  });

  it("clamps to maximum when above range", () => {
    expect(clampSearchResultCount(11)).toBe(MAX_SEARCH_RESULTS);
    expect(clampSearchResultCount(100)).toBe(MAX_SEARCH_RESULTS);
  });
});

describe("spillFullContentToTempFile", () => {
  it("writes content to a temp file and returns the path", async () => {
    const content = "hello world\nline 2";
    const path = await spillFullContentToTempFile(content);
    const read = await readFile(path, "utf8");
    expect(read).toBe(content);
  });
});
