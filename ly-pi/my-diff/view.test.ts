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

  it("replaces binary content (NUL byte) with a placeholder", () => {
    const view = buildDiffView({ status: "?", path: "a.png" }, "PNG\0\x01\x02");
    expect(view.lines).toEqual(["Binary file, not shown"]);
  });

  it("replaces git binary diff output with a placeholder", () => {
    const view = buildDiffView(
      { status: "M", path: "a.png" },
      "Binary files a/a.png and b/a.png differ\n",
    );
    expect(view.lines).toEqual(["Binary file, not shown"]);
  });

  it("shows content at exactly 500 lines", () => {
    const raw = Array.from({ length: 500 }, (_, i) => `+line ${i}`).join("\n");
    const view = buildDiffView({ status: "M", path: "a.ts" }, raw);
    expect(view.lines).toHaveLength(500);
  });

  it("replaces content at 501 lines with a placeholder", () => {
    const raw = Array.from({ length: 501 }, (_, i) => `+line ${i}`).join("\n");
    const view = buildDiffView({ status: "M", path: "a.ts" }, raw);
    expect(view.lines).toEqual([
      "Output too large (501 lines, limit 500), not shown",
    ]);
  });
});
