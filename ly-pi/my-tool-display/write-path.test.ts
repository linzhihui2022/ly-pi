import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isWithinWorkspace,
  realpathOrUndefined,
  resolveSafeWritePath,
  resolveWritePath,
} from "./write-path";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tool-display-path-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("isWithinWorkspace", () => {
  it("accepts the workspace itself and nested paths", () => {
    expect(isWithinWorkspace("/tmp/w", "/tmp/w")).toBe(true);
    expect(isWithinWorkspace("/tmp/w", "/tmp/w/a/b.txt")).toBe(true);
  });

  it("rejects parents and siblings", () => {
    expect(isWithinWorkspace("/tmp/w", "/tmp")).toBe(false);
    expect(isWithinWorkspace("/tmp/w", "/tmp/other")).toBe(false);
  });
});

describe("realpathOrUndefined", () => {
  it("resolves existing paths", () => {
    expect(realpathOrUndefined(root)).toMatchObject({ resolved: true });
  });

  it("returns the error for missing paths", () => {
    const result = realpathOrUndefined(join(root, "missing"));
    expect(result).toMatchObject({ resolved: false });
    if (!result.resolved) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

describe("resolveWritePath", () => {
  it("resolves relative paths against the cwd", () => {
    expect(resolveWritePath(root, "sub/file.txt")).toEqual({
      resolved: true,
      path: join(root, "sub/file.txt"),
    });
  });

  it("reports paths that cannot be resolved", () => {
    const result = resolveWritePath(root, "file:///%");
    expect(result).toMatchObject({ resolved: false });
  });
});

describe("resolveSafeWritePath", () => {
  it("accepts a file that does not exist yet", () => {
    expect(resolveSafeWritePath(root, "new.txt")).toMatchObject({
      safe: true,
      existed: false,
    });
  });

  it("accepts an existing regular file", () => {
    writeFileSync(join(root, "existing.txt"), "hi");
    expect(resolveSafeWritePath(root, "existing.txt")).toMatchObject({
      safe: true,
      existed: true,
    });
  });

  it("rejects blank paths", () => {
    const result = resolveSafeWritePath(root, "   ");
    expect(result).toMatchObject({ safe: false });
    if (!result.safe) expect(result.reason).toContain("empty");
  });

  it("rejects an unresolvable workspace", () => {
    const result = resolveSafeWritePath(
      join(root, "missing-workspace"),
      "a.txt",
    );
    expect(result).toMatchObject({ safe: false });
    if (!result.safe) expect(result.reason).toContain("workspace");
  });

  it("rejects paths outside the workspace", () => {
    const result = resolveSafeWritePath(root, "../outside.txt");
    expect(result).toMatchObject({ safe: false });
    if (!result.safe) expect(result.reason).toContain("outside");
  });

  it("rejects symbolic links", () => {
    const target = join(root, "real.txt");
    writeFileSync(target, "hi");
    symlinkSync(target, join(root, "link.txt"));

    const result = resolveSafeWritePath(root, "link.txt");
    expect(result).toMatchObject({ safe: false });
    if (!result.safe) expect(result.reason).toContain("symbolic link");
  });

  it("rejects directories", () => {
    mkdirSync(join(root, "dir"));
    const result = resolveSafeWritePath(root, "dir");
    expect(result).toMatchObject({ safe: false });
    if (!result.safe) expect(result.reason).toContain("regular file");
  });

  it("reports stat failures other than a missing file", () => {
    writeFileSync(join(root, "plain.txt"), "hi");
    const result = resolveSafeWritePath(root, "plain.txt/child.txt");
    expect(result).toMatchObject({ safe: false });
  });

  it("reports an unresolvable target path", () => {
    const result = resolveSafeWritePath(root, "file:///%");
    expect(result).toMatchObject({ safe: false });
  });

  it("walks up to the first existing parent for nested new files", () => {
    expect(resolveSafeWritePath(root, "a/b/c.txt")).toMatchObject({
      safe: true,
      existed: false,
    });
  });
});
