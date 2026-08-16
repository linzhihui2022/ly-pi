import { describe, expect, it } from "vitest";
import { buildDiffView, classifyDiffLine, formatListItem } from "./view";

describe("formatListItem", () => {
  it("renders single-letter status plus path", () => {
    expect(formatListItem({ status: "M", path: "src/a.ts" })).toBe(
      "M src/a.ts",
    );
    expect(formatListItem({ status: "A", path: "src/new.ts" })).toBe(
      "A src/new.ts",
    );
  });
});

describe("classifyDiffLine", () => {
  it("classifies additions", () => {
    expect(classifyDiffLine("+const x = 1;")).toBe("added");
  });

  it("classifies removals", () => {
    expect(classifyDiffLine("-const x = 1;")).toBe("removed");
  });

  it("treats diff headers as context, not add/remove", () => {
    expect(classifyDiffLine("+++ b/src/a.ts")).toBe("context");
    expect(classifyDiffLine("--- a/src/a.ts")).toBe("context");
    expect(classifyDiffLine("@@ -1,2 +1,2 @@")).toBe("context");
    expect(classifyDiffLine("diff --git a/x b/x")).toBe("context");
  });

  it("treats everything else as context", () => {
    expect(classifyDiffLine(" unchanged line")).toBe("context");
    expect(classifyDiffLine("")).toBe("context");
  });
});

describe("buildDiffView", () => {
  it("builds title from status and path", () => {
    const view = buildDiffView({ status: "M", path: "src/a.ts" }, "@@ x\n+a\n");
    expect(view.title).toBe("M src/a.ts");
  });

  it("splits raw diff into lines without trailing empty line", () => {
    const view = buildDiffView({ status: "M", path: "a.ts" }, "+a\n+b\n");
    expect(view.lines).toEqual(["+a", "+b"]);
  });

  it("yields empty lines for empty diff", () => {
    const view = buildDiffView({ status: "M", path: "a.ts" }, "");
    expect(view.lines).toEqual([]);
  });

  it("titles untracked full text with ?", () => {
    const view = buildDiffView(
      { status: "?", path: "src/u.ts" },
      "line1\nline2\n",
    );
    expect(view.title).toBe("? src/u.ts");
    expect(view.lines).toEqual(["line1", "line2"]);
  });
});
