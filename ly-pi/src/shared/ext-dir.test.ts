import { describe, expect, it } from "vitest";
import { resolveExtDir } from "./ext-dir";

describe("resolveExtDir", () => {
  it("returns the directory of the calling file as an absolute path", () => {
    const dir = resolveExtDir(import.meta);
    expect(dir).toContain("shared");
    expect(dir).not.toContain("file://");
    expect(dir).toMatch(/^\//);
  });
});
