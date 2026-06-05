import { describe, it, expect, vi } from "vitest";
import { renderMarkdownToHtml, stripMarkdown, buildHtmlDocument, extractAssistantText, loadCss, ansiToHtml } from "./render";

describe("renderMarkdownToHtml", () => {
  it("renders heading and paragraph", () => {
    const md = "# Hello\n\nWorld";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
  });

  it("renders code block with highlighting", () => {
    const md = "```ts\nconst x = 1;\n```";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const");
  });

  it("renders code block with unknown language as plaintext", () => {
    const md = "```nonexistent_lang\nsome code\n```";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("some code");
  });

  it("renders table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });
});

describe("loadCss", () => {
  it("returns empty CSS when files are missing", () => {
    const result = loadCss("/nonexistent/path");
    expect(result).toEqual({ github: "", highlight: "" });
  });
});

describe("stripMarkdown", () => {
  it("removes heading markers", () => {
    expect(stripMarkdown("# Hello")).toBe("Hello");
  });

  it("removes bold markers", () => {
    expect(stripMarkdown("**bold**")).toBe("bold");
  });

  it("removes code backticks", () => {
    expect(stripMarkdown("`code`")).toBe("code");
  });

  it("removes code fences", () => {
    const md = "```ts\nconst x = 1;\n```";
    expect(stripMarkdown(md)).toBe("const x = 1;");
  });

  it("removes link syntax keeping text", () => {
    expect(stripMarkdown("[text](url)")).toBe("text");
  });

  it("handles multiline", () => {
    const md = "# Title\n\nSome **bold** text.\n\n```\ncode\n```";
    expect(stripMarkdown(md)).toBe("Title\n\nSome bold text.\n\ncode");
  });
});

describe("buildHtmlDocument", () => {
  it("wraps body in full HTML document", () => {
    const doc = buildHtmlDocument("<p>hello</p>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<html");
    expect(doc).toContain("<p>hello</p>");
    expect(doc).toContain(".markdown-body");
  });

  it("includes thinking block when provided", () => {
    const doc = buildHtmlDocument("<p>hello</p>", "think content");
    expect(doc).toContain("<details");
    expect(doc).toContain("think content");
    expect(doc).toContain("</details>");
  });

  it("omits thinking block when not provided", () => {
    const doc = buildHtmlDocument("<p>hello</p>");
    expect(doc).not.toContain("<details");
  });

  it("renders ANSI colors in thinking block as HTML spans", () => {
    const thinking = "\x1b[38;2;203;166;247mThinking:\x1b[39m \x1b[38;2;166;173;200m部署完成\x1b[0m";
    const doc = buildHtmlDocument("<p>hello</p>", thinking);
    expect(doc).toContain('<span style="color:rgb(203,166,247)">Thinking:</span>');
    expect(doc).toContain('<span style="color:rgb(166,173,200)">部署完成</span>');
  });
});

describe("ansiToHtml", () => {
  it("converts true-color ANSI to HTML spans", () => {
    const input = "\x1b[38;2;255;0;0mred\x1b[39m";
    expect(ansiToHtml(input)).toBe('<span style="color:rgb(255,0,0)">red</span>');
  });

  it("handles reset code (0)", () => {
    const input = "\x1b[38;2;255;0;0mred\x1b[0mnormal";
    expect(ansiToHtml(input)).toBe('<span style="color:rgb(255,0,0)">red</span>normal');
  });

  it("escapes HTML in non-ANSI text", () => {
    expect(ansiToHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("ignores unsupported ANSI codes", () => {
    const input = "\x1b[1mbold\x1b[0m";
    expect(ansiToHtml(input)).toBe("bold");
  });

  it("handles plain text without ANSI", () => {
    expect(ansiToHtml("hello world")).toBe("hello world");
  });

  it("closes remaining spans at end of string", () => {
    const input = "\x1b[38;2;100;100;100mgray";
    expect(ansiToHtml(input)).toBe('<span style="color:rgb(100,100,100)">gray</span>');
  });

  it("handles adjacent color spans", () => {
    const input = "\x1b[38;2;255;0;0mr\x1b[38;2;0;255;0mg\x1b[38;2;0;0;255mb\x1b[0m";
    expect(ansiToHtml(input)).toBe(
      '<span style="color:rgb(255,0,0)">r</span>' +
      '<span style="color:rgb(0,255,0)">g</span>' +
      '<span style="color:rgb(0,0,255)">b</span>'
    );
  });

  it("ignores incomplete true-color sequences (missing B)", () => {
    const input = "\x1b[38;2;255;0mtext";
    expect(ansiToHtml(input)).toBe("text");
  });

  it("ignores incomplete true-color sequences (missing all RGB)", () => {
    const input = "\x1b[38;2mtext";
    expect(ansiToHtml(input)).toBe("text");
  });

  it("handles empty ANSI params as reset", () => {
    const input = "\x1b[38;2;255;0;0mred\x1b[mnormal";
    expect(ansiToHtml(input)).toBe(
      '<span style="color:rgb(255,0,0)">red</span>normal'
    );
  });

  it("handles text ending with reset code", () => {
    const input = "\x1b[38;2;255;0;0mred\x1b[0m";
    expect(ansiToHtml(input)).toBe(
      '<span style="color:rgb(255,0,0)">red</span>'
    );
  });

  it("handles color code at end with no trailing text", () => {
    const input = "\x1b[38;2;100;100;100m";
    expect(ansiToHtml(input)).toBe(
      '<span style="color:rgb(100,100,100)"></span>'
    );
  });

  it("ignores 256-color mode (38;5)", () => {
    const input = "\x1b[38;5;196mtext\x1b[0m";
    expect(ansiToHtml(input)).toBe("text");
  });
});

describe("extractAssistantText", () => {
  it("extracts text from TextContent array", () => {
    const content = [{ type: "text" as const, text: "hello" }];
    expect(extractAssistantText(content)).toBe("hello");
  });

  it("extracts text from mixed content (skips tool calls)", () => {
    const content = [
      { type: "text" as const, text: "hello" },
      { type: "toolCall" as const, id: "1", name: "bash", arguments: {} },
    ];
    expect(extractAssistantText(content)).toBe("hello");
  });

  it("extracts thinking from ThinkingContent", () => {
    const content = [{ type: "thinking" as const, thinking: "reasoning" }];
    expect(extractAssistantText(content, "thinking")).toBe("reasoning");
  });

  it("returns empty string for empty array", () => {
    expect(extractAssistantText([])).toBe("");
  });

  it("returns empty string when text is undefined", () => {
    const content = [{ type: "text" as const, text: undefined }];
    expect(extractAssistantText(content)).toBe("");
  });

  it("returns empty string when thinking is undefined", () => {
    const content = [{ type: "thinking" as const, thinking: undefined }];
    expect(extractAssistantText(content, "thinking")).toBe("");
  });
});
