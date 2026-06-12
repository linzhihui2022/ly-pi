import { describe, it, expect } from "vitest";
import {
  buildEmptyResultsEnvelope,
  formatSearchResultsBody,
  formatTruncationFooter,
  formatFetchHeader,
  renderSearchResultsPreview,
  renderFetchedContentPreview,
  formatUsageNotify,
} from "./render";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SearchResult, UsageResponse } from "./types";

const mockTheme: Theme = {
  fg: (_color: string, text: string) => text,
} as Theme;

describe("buildEmptyResultsEnvelope", () => {
  it("returns empty results with error message", () => {
    const result = buildEmptyResultsEnvelope("test query", "Tavily", "API error");
    expect(result.content[0].text).toContain("No results found");
    expect(result.content[0].text).toContain("API error");
    expect(result.details.resultCount).toBe(0);
  });

  it("returns empty results without error message", () => {
    const result = buildEmptyResultsEnvelope("test query", "Tavily");
    expect(result.content[0].text).toContain("No results found");
    expect(result.content[0].text).not.toContain("Error:");
    expect(result.details.resultCount).toBe(0);
  });
});

describe("formatSearchResultsBody", () => {
  it("formats search results as markdown", () => {
    const response = {
      query: "test",
      results: [
        { title: "Title 1", url: "https://example.com/1", snippet: "Snippet 1" },
        { title: "Title 2", url: "https://example.com/2", snippet: "Snippet 2" },
      ],
    };
    const body = formatSearchResultsBody(response);
    expect(body).toContain("Title 1");
    expect(body).toContain("https://example.com/1");
    expect(body).toContain("Snippet 1");
    expect(body).toContain("Title 2");
    expect(body).toContain("2. **Title 2**");
  });

  it("returns header only when no results", () => {
    const body = formatSearchResultsBody({ query: "test", results: [] });
    expect(body).toContain("Search results for");
    expect(body).not.toContain("1.");
  });
});

describe("renderSearchResultsPreview", () => {
  it("renders preview for results", () => {
    const results: SearchResult[] = [
      { title: "A", url: "https://a.com", snippet: "..." },
      { title: "B", url: "https://b.com", snippet: "..." },
    ];
    const text = renderSearchResultsPreview(results, mockTheme);
    expect(text).toContain("A");
    expect(text).toContain("B");
  });

  it("limits preview to 5 results", () => {
    const results: SearchResult[] = Array.from({ length: 7 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      snippet: "...",
    }));
    const text = renderSearchResultsPreview(results, mockTheme);
    expect(text).toContain("Result 0");
    expect(text).toContain("Result 4");
    expect(text).not.toContain("Result 5");
    expect(text).toContain("... and 2 more");
  });
});

describe("formatTruncationFooter", () => {
  it("formats truncation info", () => {
    const truncation = {
      truncated: true,
      truncatedBy: "lines" as const,
      content: "foo",
      totalLines: 100,
      outputLines: 50,
      totalBytes: 1000,
      outputBytes: 500,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines: 2000,
      maxBytes: 51200,
    };
    const footer = formatTruncationFooter(truncation, "/tmp/file.txt");
    expect(footer).toContain("showing 50 of 100 lines");
    expect(footer).toContain("/tmp/file.txt");
  });
});

describe("formatFetchHeader", () => {
  it("formats header with content type", () => {
    const header = formatFetchHeader("https://example.com", "text/html");
    expect(header).toContain("Fetched:");
    expect(header).toContain("https://example.com");
    expect(header).toContain("Content-Type:");
    expect(header).toContain("text/html");
  });

  it("formats header without content type", () => {
    const header = formatFetchHeader("https://example.com", "");
    expect(header).toContain("Fetched:");
    expect(header).not.toContain("Content-Type:");
  });
});

describe("renderFetchedContentPreview", () => {
  it("renders preview lines", () => {
    const content = Array.from({ length: 5 }, (_, i) => `line ${i}`).join("\n");
    const text = renderFetchedContentPreview(content, mockTheme);
    expect(text).toContain("line 0");
    expect(text).toContain("line 4");
  });

  it("truncates long content", () => {
    const content = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const text = renderFetchedContentPreview(content, mockTheme);
    expect(text).toContain("line 0");
    expect(text).toContain("... (use read tool to see full content)");
    expect(text).not.toContain("line 15");
  });
});

describe("formatUsageNotify", () => {
  it("formats usage as a concise string", () => {
    const response: UsageResponse = {
      ok: true,
      key: { usage: 45, limit: 100, remaining: 55 },
      plan: { usage: 30, limit: 200, remaining: 170 },
      features: {},
    };
    const text = formatUsageNotify(response, "Tavily");
    expect(text).toBe(
      "Tavily: key 45/100 used (55 remaining); plan 30/200 used (170 remaining)"
    );
  });

  it("handles zero usage", () => {
    const response: UsageResponse = {
      ok: true,
      key: { usage: 0, limit: 100, remaining: 100 },
      plan: { usage: 0, limit: 200, remaining: 200 },
      features: {},
    };
    const text = formatUsageNotify(response, "Tavily");
    expect(text).toContain("key 0/100 used (100 remaining)");
    expect(text).toContain("plan 0/200 used (200 remaining)");
  });
});
