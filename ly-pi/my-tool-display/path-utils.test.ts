import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveToolPath } from "./path-utils";

describe("resolveToolPath", () => {
  it("does not expand backslash tilde paths on POSIX", () => {
    expect(
      resolveToolPath("~\\file.txt", "/workspace", {
        platform: "linux",
        homeDir: "/home/user",
      }),
    ).toBe(posix.resolve("/workspace", "~\\file.txt"));
  });

  it("expands slash tilde paths on POSIX", () => {
    expect(
      resolveToolPath("~/file.txt", "/workspace", {
        platform: "linux",
        homeDir: "/home/user",
      }),
    ).toBe("/home/user/file.txt");
  });

  it.each([
    "/mnt/c/project/file.txt",
    "/cygdrive/c/project/file.txt",
  ])("normalizes Windows shell path %s", (path) => {
    expect(
      resolveToolPath(path, "C:\\workspace", {
        platform: "win32",
        homeDir: "C:\\Users\\user",
      }),
    ).toBe("C:\\project\\file.txt");
  });

  it("expands backslash tilde paths on Windows", () => {
    expect(
      resolveToolPath("~\\file.txt", "C:\\workspace", {
        platform: "win32",
        homeDir: "C:\\Users\\user",
      }),
    ).toBe("C:\\Users\\user\\file.txt");
  });

  it("preserves native Windows absolute paths", () => {
    expect(
      resolveToolPath("C:\\project\\file.txt", "C:\\workspace", {
        platform: "win32",
      }),
    ).toBe("C:\\project\\file.txt");
  });

  it("uses the native resolver for non-drive Windows paths", () => {
    expect(
      resolveToolPath("/tmp/file.txt", "C:\\workspace", {
        platform: "win32",
      }),
    ).toBe(win32.resolve("/tmp/file.txt"));
  });

  it("supports at prefixes, exact home paths, and file URLs", () => {
    expect(
      resolveToolPath("@~/file.txt", "/workspace", {
        platform: "linux",
        homeDir: "/home/user",
      }),
    ).toBe("/home/user/file.txt");
    expect(
      resolveToolPath("~", "/workspace", {
        platform: "linux",
        homeDir: "/home/user",
      }),
    ).toBe("/home/user");
    expect(
      resolveToolPath("file:///workspace/file.txt", "/tmp", {
        platform: "linux",
      }),
    ).toBe("/workspace/file.txt");
  });
});
