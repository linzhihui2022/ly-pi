import { describe, it, expect, vi } from "vitest";
import { renderMarkdownToHtml, stripMarkdown, buildHtmlDocument, extractAssistantText, loadCss } from "./render";

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
