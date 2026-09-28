import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-tui", () => ({
  Text: class {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  },
}));

import {
  formatEditCall,
  formatReadCall,
  formatWriteCall,
  renderBashResult,
  renderCompactTextResult,
  renderEditDiff,
  renderEditResult,
  renderWriteResult,
} from "./render";

const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
};

function textOf(node: unknown): string {
  return (node as { text: string }).text;
}

describe("renderCompactTextResult", () => {
  it("shows the pending label while streaming", () => {
    const node = renderCompactTextResult(
      { content: [] },
      { expanded: false, isPartial: true },
      theme,
      { isError: false },
      "Searching...",
      "Search failed.",
    );
    expect(textOf(node)).toBe("<warning>Searching...</warning>");
  });

  it("renders nothing while collapsed and idle", () => {
    const node = renderCompactTextResult(
      { content: [{ type: "text", text: "out" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: false },
      "p",
      "f",
    );
    expect(textOf(node)).toBe("");
  });

  it("renders the output when expanded", () => {
    const node = renderCompactTextResult(
      { content: [{ type: "text", text: "out" }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      "p",
      "f",
    );
    expect(textOf(node)).toBe("<toolOutput>out</toolOutput>");
  });

  it("falls back to the failure label for empty errors", () => {
    const node = renderCompactTextResult(
      { content: [] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      "p",
      "Search failed.",
    );
    expect(textOf(node)).toBe("<error>Search failed.</error>");
  });

  it("shows error output when present", () => {
    const node = renderCompactTextResult(
      { content: [{ type: "text", text: "boom" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      "p",
      "f",
    );
    expect(textOf(node)).toBe("<error>boom</error>");
  });
});

describe("renderBashResult", () => {
  it("reports a failure without output", () => {
    const node = renderBashResult(
      { content: [] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>Bash command failed.</error>");
  });

  it("shows the whole failure output when expanded", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "boom" }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>Bash command failed.\nboom</error>");
  });

  it("drops trailing blank lines from failure output", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "boom\n\n" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>Bash command failed.\nboom</error>");
  });

  it("hides failure output entirely when collapsedLines is 0", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "l1\nl2" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      0,
    );
    expect(textOf(node)).toContain("Output hidden (2 lines");
  });

  it("notes earlier hidden failure lines", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "l1\nl2\nl3" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: true },
      2,
    );
    expect(textOf(node)).toContain("1 earlier lines hidden");
    expect(textOf(node)).toContain("l2\nl3");
  });

  it("shows a placeholder when successful output is empty", () => {
    const node = renderBashResult(
      { content: [] },
      { expanded: false, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<muted>(no output)</muted>");
  });

  it("marks running commands", () => {
    const node = renderBashResult(
      { content: [] },
      { expanded: false, isPartial: true },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<muted>Running...</muted>");
  });

  it("shows the whole output when expanded", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "ok" }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<toolOutput>ok</toolOutput>");
  });

  it("drops trailing blank lines from successful output", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "ok\n\n" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<toolOutput>ok</toolOutput>");
  });

  it("hides all successful output when collapsedLines is 0", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "l1\nl2" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: false },
      0,
    );
    expect(textOf(node)).toBe(
      "<muted>Output hidden (2 lines; expand to view)</muted>",
    );
  });

  it("notes remaining lines when collapsed", () => {
    const node = renderBashResult(
      { content: [{ type: "text", text: "l1\nl2\nl3" }] },
      { expanded: false, isPartial: false },
      theme,
      { isError: false },
      2,
    );
    expect(textOf(node)).toBe(
      "<toolOutput>l1\nl2\n<muted>... (1 more lines, expand to view)</muted></toolOutput>",
    );
  });
});

describe("formatEditCall", () => {
  it("renders the path", () => {
    expect(formatEditCall({ file_path: "a.ts" }, theme)).toBe(
      "<toolTitle>**edit**</toolTitle> <accent>a.ts</accent>",
    );
  });

  it("prefers file_path over path", () => {
    expect(
      formatEditCall({ file_path: "a.ts", path: "b.ts" }, theme),
    ).toContain("a.ts");
  });

  it("falls back to an ellipsis without a path", () => {
    expect(formatEditCall({}, theme)).toBe(
      "<toolTitle>**edit**</toolTitle> <accent>...</accent>",
    );
  });
});

describe("formatWriteCall", () => {
  it("renders the path", () => {
    expect(formatWriteCall({ file_path: "a.ts" }, theme)).toBe(
      "<toolTitle>**write**</toolTitle> <accent>a.ts</accent>",
    );
  });

  it("falls back to an ellipsis without a path", () => {
    expect(formatWriteCall({}, theme)).toBe(
      "<toolTitle>**write**</toolTitle> <accent>...</accent>",
    );
  });
});

describe("formatReadCall", () => {
  it("renders the path without a range by default", () => {
    expect(formatReadCall({ file_path: "a.ts" }, theme)).toBe(
      "<toolTitle>**read**</toolTitle> <accent>a.ts</accent><warning></warning>",
    );
  });

  it("renders an offset-only range", () => {
    expect(formatReadCall({ file_path: "a.ts", offset: 5 }, theme)).toContain(
      "<warning>:5</warning>",
    );
  });

  it("renders an offset and limit range", () => {
    expect(
      formatReadCall({ file_path: "a.ts", offset: 5, limit: 10 }, theme),
    ).toContain("<warning>:5-14</warning>");
  });

  it("falls back to an ellipsis without a path", () => {
    expect(formatReadCall({ limit: 3 }, theme)).toContain(
      "<accent>...</accent>",
    );
  });
});

describe("renderEditDiff", () => {
  it("colors added, removed and context lines", () => {
    const node = renderEditDiff(
      "@@ -1 +1 @@\n-old\n+new\n context",
      { expanded: true },
      theme,
      10,
    );
    expect(textOf(node)).toBe(
      "<toolDiffContext>@@ -1 +1 @@</toolDiffContext>\n<toolDiffRemoved>-old</toolDiffRemoved>\n<toolDiffAdded>+new</toolDiffAdded>\n<toolDiffContext> context</toolDiffContext>",
    );
  });

  it("collapses long diffs and notes the remainder", () => {
    const node = renderEditDiff("a\nb\nc", { expanded: false }, theme, 1);
    expect(textOf(node)).toContain("... (2 more lines, expand to view)");
  });

  it("sanitizes control characters in the diff", () => {
    const node = renderEditDiff(
      "+\u001b[31mred",
      { expanded: true },
      theme,
      10,
    );
    expect(textOf(node)).toBe("<toolDiffAdded>+red</toolDiffAdded>");
  });
});

describe("renderEditResult", () => {
  it("renders the diff carried in the details", () => {
    const node = renderEditResult(
      { content: [], details: { diff: "+new" } },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<toolDiffAdded>+new</toolDiffAdded>");
  });

  it("reports a missing diff", () => {
    const node = renderEditResult(
      { content: [] },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe(
      "<muted>Edit completed (diff unavailable).</muted>",
    );
  });

  it("prefers the failure text on error", () => {
    const node = renderEditResult(
      { content: [{ type: "text", text: "boom" }] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>boom</error>");
  });

  it("shows a placeholder for empty errors", () => {
    const node = renderEditResult(
      { content: [] },
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>Edit failed.</error>");
  });

  it("marks streaming edits", () => {
    const node = renderEditResult(
      { content: [] },
      { expanded: true, isPartial: true },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<warning>Editing...</warning>");
  });

  it("ignores an empty diff string", () => {
    const node = renderEditResult(
      { content: [], details: { diff: "" } },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe(
      "<muted>Edit completed (diff unavailable).</muted>",
    );
  });
});

describe("renderWriteResult", () => {
  it("renders a diff", () => {
    const node = renderWriteResult(
      { content: [] },
      { kind: "diff", diff: "+new" },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<toolDiffAdded>+new</toolDiffAdded>");
  });

  it("renders a summary", () => {
    const node = renderWriteResult(
      { content: [] },
      { kind: "summary", summary: "no text changes" },
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<warning>no text changes</warning>");
  });

  it("falls back to the details when no diff is passed", () => {
    const node = renderWriteResult(
      { content: [], details: { writeDiff: { kind: "diff", diff: "+x" } } },
      undefined,
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<toolDiffAdded>+x</toolDiffAdded>");
  });

  it("reports an unavailable diff", () => {
    const node = renderWriteResult(
      { content: [] },
      undefined,
      { expanded: true, isPartial: false },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe(
      "<warning>Write completed (diff unavailable).</warning>",
    );
  });

  it("prefers the failure text on error", () => {
    const node = renderWriteResult(
      { content: [{ type: "text", text: "boom" }] },
      undefined,
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>boom</error>");
  });

  it("shows a placeholder for empty errors", () => {
    const node = renderWriteResult(
      { content: [] },
      undefined,
      { expanded: true, isPartial: false },
      theme,
      { isError: true },
      10,
    );
    expect(textOf(node)).toBe("<error>Write failed.</error>");
  });

  it("marks streaming writes", () => {
    const node = renderWriteResult(
      { content: [] },
      undefined,
      { expanded: true, isPartial: true },
      theme,
      { isError: false },
      10,
    );
    expect(textOf(node)).toBe("<warning>Writing...</warning>");
  });
});
