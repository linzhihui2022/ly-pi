import { describe, expect, it } from "vitest";
import { classifyStatusError, parseStatusList } from "./git";

describe("parseStatusList", () => {
  it("returns empty list for clean tree", () => {
    expect(parseStatusList("")).toEqual([]);
  });

  it("parses unstaged modification as M", () => {
    expect(parseStatusList(" M src/a.ts\n")).toEqual([
      { status: "M", path: "src/a.ts" },
    ]);
  });

  it("parses staged add as A", () => {
    expect(parseStatusList("A  src/new.ts\n")).toEqual([
      { status: "A", path: "src/new.ts" },
    ]);
  });

  it("includes untracked entries as ?", () => {
    expect(parseStatusList("?? src/u.ts\n")).toEqual([
      { status: "?", path: "src/u.ts" },
    ]);
  });

  it("excludes ignored entries", () => {
    expect(parseStatusList("!! build/\n")).toEqual([]);
  });

  it("sorts untracked and tracked entries together by path", () => {
    expect(parseStatusList(" M b.ts\n?? a.ts\n")).toEqual([
      { status: "?", path: "a.ts" },
      { status: "M", path: "b.ts" },
    ]);
  });

  it("maps deleted to M (change vs HEAD)", () => {
    expect(parseStatusList(" D src/gone.ts\n")).toEqual([
      { status: "M", path: "src/gone.ts" },
    ]);
  });

  it("maps rename to M with the new path", () => {
    expect(parseStatusList("R  src/old.ts -> src/new.ts\n")).toEqual([
      { status: "M", path: "src/new.ts" },
    ]);
  });

  it("passes non-ASCII paths through unchanged (git runs with core.quotepath=false)", () => {
    expect(parseStatusList("?? 中文.ts\n")).toEqual([
      { status: "?", path: "中文.ts" },
    ]);
  });

  it("sorts entries by path", () => {
    expect(parseStatusList(" M b.ts\n M a.ts\n")).toEqual([
      { status: "M", path: "a.ts" },
      { status: "M", path: "b.ts" },
    ]);
  });
});

describe("classifyStatusError", () => {
  it("classifies git's not-a-repo fatal as not-repo", () => {
    const err = new Error(
      "Command failed: git ...\nfatal: not a git repository (or any of the parent directories): .git",
    );
    expect(classifyStatusError(err)).toBe("not-repo");
  });

  it("classifies timeouts and other failures as fatal", () => {
    expect(
      classifyStatusError(new Error("Command failed: git ...\nkilled: true")),
    ).toBe("fatal");
  });

  it("classifies non-Error values as fatal", () => {
    expect(classifyStatusError("boom")).toBe("fatal");
    expect(classifyStatusError(undefined)).toBe("fatal");
  });
});
