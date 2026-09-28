import { describe, expect, it } from "vitest";
import { computeDiff, formatDiff } from "./diff";

describe("computeDiff", () => {
  it("keeps identical text", () => {
    expect(computeDiff("a\nb", "a\nb")).toEqual([
      { type: "keep", text: "a" },
      { type: "keep", text: "b" },
    ]);
  });

  it("detects added lines", () => {
    expect(computeDiff("a", "a\nb")).toEqual([
      { type: "keep", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("detects removed lines", () => {
    expect(computeDiff("a\nb", "a")).toEqual([
      { type: "keep", text: "a" },
      { type: "remove", text: "b" },
    ]);
  });

  it("handles a full replacement", () => {
    const diff = computeDiff("old", "new");
    expect(diff).toContainEqual({ type: "remove", text: "old" });
    expect(diff).toContainEqual({ type: "add", text: "new" });
  });

  it("keeps the shared lines around a change", () => {
    const diff = computeDiff("a\nb\nc", "a\nB\nc");
    expect(
      diff.filter((line) => line.type === "keep").map((line) => line.text),
    ).toEqual(["a", "c"]);
  });

  it("treats empty input as a single kept empty line", () => {
    expect(computeDiff("", "")).toEqual([{ type: "keep", text: "" }]);
  });

  it("reports additions when starting from empty", () => {
    expect(computeDiff("", "x")).toEqual([
      { type: "remove", text: "" },
      { type: "add", text: "x" },
    ]);
  });
});

describe("formatDiff", () => {
  it("summarizes how many lines changed", () => {
    const text = formatDiff("a", "a\nb");

    expect(text).toContain("变更预览 (1 处");
    expect(text).toContain("+1");
    expect(text).toContain("−0");
  });

  it("colors kept, added and removed lines", () => {
    const text = formatDiff("a", "a\nb");

    expect(text).toContain("\x1b[90m  a");
    expect(text).toContain("+ b");
  });

  it("marks removed lines in red", () => {
    expect(formatDiff("a\nb", "a")).toContain("− b");
  });
});
