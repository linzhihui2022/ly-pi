import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadFile } from "./file";

describe("loadFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shared-file-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads file contents", () => {
    writeFileSync(join(dir, "test.txt"), "hello world");
    const content = loadFile(join(dir, "test.txt"));
    expect(content).toBe("hello world");
  });

  it("returns empty string for missing file", () => {
    const content = loadFile(join(dir, "missing.txt"));
    expect(content).toBe("");
  });

  it("returns empty string for directory path", () => {
    const content = loadFile(dir);
    expect(content).toBe("");
  });
});
