import { describe, it, expect, vi } from "vitest";

// --- Mock @earendil-works/pi-tui (not available in test environment) ---
// vitest hoists vi.mock, so we must inline the class definition
vi.mock("@earendil-works/pi-tui", () => ({
  Text: class {
    constructor(public content: string, _width?: number, _height?: number) {}
  },
}));

const mockTheme = {
  fg: (_color: string, text: string): string => text,
  bold: (text: string): string => text,
};

// --- Import modules under test ---
import { extractTextOutput, splitLines, compactOutputLines, pluralize, previewLines, shortenPath, countNonEmptyLines } from "./render-utils";
import { normalizeConfig, DEFAULT_CONFIG } from "./config";
import { createReadToolOverride } from "./tool-overrides";

// ============================================================
// render-utils tests
// ============================================================

describe("extractTextOutput", () => {
  it("extracts text from content blocks", () => {
    const result = {
      content: [
        { type: "text", text: "line 1\nline 2" },
        { type: "image", data: "..." },
      ],
    };
    expect(extractTextOutput(result)).toBe("line 1\nline 2");
  });

  it("returns empty string for no content", () => {
    expect(extractTextOutput({})).toBe("");
  });

  it("returns empty string for non-array content", () => {
    expect(extractTextOutput({ content: "not array" })).toBe("");
  });

  it("skips blocks with no text field", () => {
    const result = {
      content: [
        { type: "text" },
        { type: "text", text: "hello" },
      ],
    };
    expect(extractTextOutput(result)).toBe("hello");
  });

  it("skips blocks with non-text type", () => {
    const result = {
      content: [
        { type: "image", data: "..." },
        { type: "text", text: "hello" },
      ],
    };
    expect(extractTextOutput(result)).toBe("hello");
  });

  it("skips text blocks with non-string text field", () => {
    const result = {
      content: [
        { type: "text", text: 123 },
        { type: "text", text: "valid" },
      ],
    };
    expect(extractTextOutput(result)).toBe("valid");
  });
});

describe("splitLines", () => {
  it("splits text into lines", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("replaces tabs with 4 spaces", () => {
    expect(splitLines("a\tb")).toEqual(["a    b"]);
  });

  it("strips carriage returns", () => {
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("handles empty string", () => {
    expect(splitLines("")).toEqual([]);
  });
});

describe("compactOutputLines", () => {
  it("trims trailing empty lines", () => {
    const lines = ["a", "", "", ""];
    expect(compactOutputLines(lines, false)).toEqual(["a"]);
  });

  it("collapses consecutive empty lines to one when not expanded", () => {
    const lines = ["a", "", "", "b"];
    expect(compactOutputLines(lines, false)).toEqual(["a", "", "b"]);
  });

  it("preserves all empty lines when expanded", () => {
    const lines = ["a", "", "", "b", ""];
    expect(compactOutputLines(lines, true)).toEqual(["a", "", "", "b"]);
  });

  it("handles all-empty array", () => {
    expect(compactOutputLines(["", "", ""], false)).toEqual([]);
  });
});

describe("countNonEmptyLines", () => {
  it("counts non-empty lines", () => {
    expect(countNonEmptyLines(["a", "", "b", "", "c"])).toBe(3);
  });

  it("returns 0 for all empty", () => {
    expect(countNonEmptyLines(["", "  "])).toBe(0);
  });
});

describe("pluralize", () => {
  it("uses singular for count 1", () => {
    expect(pluralize(1, "line")).toBe("line");
  });

  it("uses default plural (append s) for count > 1", () => {
    expect(pluralize(3, "line")).toBe("lines");
  });

  it("uses custom plural", () => {
    expect(pluralize(2, "match", "matches")).toBe("matches");
  });
});

describe("previewLines", () => {
  it("returns all lines when under limit", () => {
    const result = previewLines(["a", "b", "c"], 5);
    expect(result.shown).toEqual(["a", "b", "c"]);
    expect(result.remaining).toBe(0);
  });

  it("truncates and reports remaining", () => {
    const result = previewLines(["a", "b", "c", "d", "e"], 3);
    expect(result.shown).toEqual(["a", "b", "c"]);
    expect(result.remaining).toBe(2);
  });

  it("handles maxLines = 0", () => {
    const result = previewLines(["a", "b"], 0);
    expect(result.shown).toEqual([]);
    expect(result.remaining).toBe(2);
  });
});

describe("shortenPath", () => {
  it("shortens home directory path", () => {
    const { homedir } = require("node:os") as typeof import("node:os");
    const home = homedir();
    const path = `${home}/src/file.ts`;
    expect(shortenPath(path)).toBe("~/src/file.ts");
  });

  it("returns empty string for undefined", () => {
    expect(shortenPath(undefined)).toBe("");
  });
});

// ============================================================
// config tests
// ============================================================

describe("normalizeConfig", () => {
  it("returns defaults for empty input", () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("merges valid overrides", () => {
    const result = normalizeConfig({ readOutputMode: "hidden", previewLines: 20 });
    expect(result.readOutputMode).toBe("hidden");
    expect(result.previewLines).toBe(20);
    expect(result.searchOutputMode).toBe(DEFAULT_CONFIG.searchOutputMode);
  });

  it("ignores invalid values for enum fields", () => {
    const result = normalizeConfig({ readOutputMode: "invalid_mode" });
    expect(result.readOutputMode).toBe(DEFAULT_CONFIG.readOutputMode);
  });

  it("clamps previewLines to at least 1", () => {
    const result = normalizeConfig({ previewLines: -5 });
    expect(result.previewLines).toBe(1);
  });

  it("rounds non-integer previewLines", () => {
    const result = normalizeConfig({ previewLines: 3.7 });
    expect(result.previewLines).toBe(3);
  });

  it("accepts boolean fields", () => {
    const result = normalizeConfig({ thinkingLabelEnabled: false, userMessageBoxEnabled: false });
    expect(result.thinkingLabelEnabled).toBe(false);
    expect(result.userMessageBoxEnabled).toBe(false);
  });

  it("validates searchOutputMode", () => {
    const result = normalizeConfig({ searchOutputMode: "preview" });
    expect(result.searchOutputMode).toBe("preview");
  });

  it("rejects invalid searchOutputMode", () => {
    const result = normalizeConfig({ searchOutputMode: "bad" });
    expect(result.searchOutputMode).toBe(DEFAULT_CONFIG.searchOutputMode);
  });

  it("validates bashOutputMode", () => {
    const result = normalizeConfig({ bashOutputMode: "preview" });
    expect(result.bashOutputMode).toBe("preview");
  });

  it("rejects invalid bashOutputMode", () => {
    const result = normalizeConfig({ bashOutputMode: "bad" });
    expect(result.bashOutputMode).toBe(DEFAULT_CONFIG.bashOutputMode);
  });

  it("validates mcpOutputMode", () => {
    const result = normalizeConfig({ mcpOutputMode: "hidden" });
    expect(result.mcpOutputMode).toBe("hidden");
  });

  it("rejects invalid mcpOutputMode", () => {
    const result = normalizeConfig({ mcpOutputMode: "bad" });
    expect(result.mcpOutputMode).toBe(DEFAULT_CONFIG.mcpOutputMode);
  });

  it("validates diffViewMode", () => {
    const result = normalizeConfig({ diffViewMode: "unified" });
    expect(result.diffViewMode).toBe("unified");
  });

  it("rejects invalid diffViewMode", () => {
    const result = normalizeConfig({ diffViewMode: "bad" });
    expect(result.diffViewMode).toBe(DEFAULT_CONFIG.diffViewMode);
  });

  it("clamps and rounds diffCollapsedLines", () => {
    const result = normalizeConfig({ diffCollapsedLines: 3.7 });
    expect(result.diffCollapsedLines).toBe(3);
  });

  it("clamps diffCollapsedLines to at least 1", () => {
    const result = normalizeConfig({ diffCollapsedLines: 0 });
    expect(result.diffCollapsedLines).toBe(1);
  });

  it("ignores non-number for previewLines", () => {
    const result = normalizeConfig({ previewLines: "abc" as unknown as number });
    expect(result.previewLines).toBe(DEFAULT_CONFIG.previewLines);
  });
});

// ============================================================
// read tool rendering tests
// ============================================================

function makeRenderContext(overrides: Record<string, unknown> = {}) {
  return {
    args: {},
    toolCallId: "test-call",
    cwd: "/project",
    argsComplete: true,
    isError: false,
    isPartial: false,
    expanded: false,
    ...overrides,
  };
}

function makeToolResult(text: string, overrides: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text", text }],
    details: {},
    ...overrides,
  };
}

describe("read renderCall", () => {
  const override = createReadToolOverride(() => DEFAULT_CONFIG);

  it("renders basic path", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts" }, mockTheme, makeRenderContext());
    expect(result).toBeDefined();
    const text = (result as { content: string }).content;
    expect(text).toContain("read");
    expect(text).toContain("src/app.ts");
  });

  it("renders with offset", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts", offset: 42 }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain(":42");
  });

  it("renders with offset and limit", () => {
    const result = override.renderCall?.({ file_path: "src/app.ts", offset: 10, limit: 20 }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain(":10-29");
  });

  it("renders missing path as ...", () => {
    const result = override.renderCall?.({}, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("...");
  });
});

describe("read renderResult — summary mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "summary" }));

  it("shows line count for non-expanded result", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2\nline3"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("loaded 3 lines");
  });

  it("shows full content when expanded", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2"), { expanded: true, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("line1");
    expect((result as { content: string }).content).toContain("line2");
  });

  it("shows expand hint when not expanded", () => {
    const result = override.renderResult?.(makeToolResult("x"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("Ctrl+O");
  });
});

describe("read renderResult — hidden mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "hidden" }));

  it("returns empty text", () => {
    const result = override.renderResult?.(makeToolResult("line1\nline2"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toBe("");
  });
});

describe("read renderResult — preview mode", () => {
  const override = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "preview", previewLines: 3 }));

  it("shows first N lines", () => {
    const lines = ["a", "b", "c", "d", "e"].join("\n");
    const result = override.renderResult?.(makeToolResult(lines), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("a");
    expect((result as { content: string }).content).toContain("c");
    expect((result as { content: string }).content).toContain("more lines");
  });

  it("shows all lines when under limit", () => {
    const result = override.renderResult?.(makeToolResult("a\nb"), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("a");
    expect((result as { content: string }).content).toContain("b");
    expect((result as { content: string }).content).not.toContain("more");
  });

  it("shows full content when expanded", () => {
    const lines = ["a", "b", "c", "d", "e"].join("\n");
    const result = override.renderResult?.(makeToolResult(lines), { expanded: true, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("a");
    expect((result as { content: string }).content).toContain("e");
  });
});

describe("read renderResult — edge cases", () => {
  const override = createReadToolOverride(() => DEFAULT_CONFIG);

  it("shows reading... when partial", () => {
    const result = override.renderResult?.(makeToolResult(""), { expanded: false, isPartial: true }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("reading...");
  });

  it("shows no output for empty result", () => {
    const result = override.renderResult?.(makeToolResult(""), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("no output");
  });

  it("shows no output for empty result in preview mode", () => {
    const previewOverride = createReadToolOverride(() => ({ ...DEFAULT_CONFIG, readOutputMode: "preview" }));
    const result = previewOverride.renderResult?.(makeToolResult(""), { expanded: false, isPartial: false }, mockTheme, makeRenderContext());
    expect((result as { content: string }).content).toContain("no output");
  });
});
