import { describe, expect, it } from "vitest";
import { buildHtmlDocument } from "./document";

describe("buildHtmlDocument", () => {
  it("wraps body HTML in a complete HTML document with the given title", () => {
    const doc = buildHtmlDocument({
      title: "Judge Log",
      bodyHtml: "<p>hello</p>",
    });
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain('<html lang="zh-CN">');
    expect(doc).toContain("<title>Judge Log</title>");
    expect(doc).toContain("<p>hello</p>");
    expect(doc).toContain("</html>");
  });

  it("includes charset and viewport meta tags", () => {
    const doc = buildHtmlDocument({ title: "t", bodyHtml: "" });
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
  });

  it("injects css into a style tag when provided", () => {
    const doc = buildHtmlDocument({
      title: "t",
      bodyHtml: "",
      css: "body { color: red; }",
    });
    expect(doc).toContain("<style>");
    expect(doc).toContain("body { color: red; }");
  });

  it("omits the style tag when css is not provided", () => {
    const doc = buildHtmlDocument({ title: "t", bodyHtml: "" });
    expect(doc).not.toContain("<style>");
  });

  it("injects js into a script tag when provided", () => {
    const doc = buildHtmlDocument({
      title: "t",
      bodyHtml: "",
      js: "function filter() {}",
    });
    expect(doc).toContain("<script>");
    expect(doc).toContain("function filter() {}");
  });

  it("omits the script tag when js is not provided", () => {
    const doc = buildHtmlDocument({ title: "t", bodyHtml: "" });
    expect(doc).not.toContain("<script>");
  });
});
