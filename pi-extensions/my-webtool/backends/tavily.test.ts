import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tavily } from "./tavily";

describe("Tavily.check", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns enabled when usage is within limits", async () => {
    const tavily = new Tavily();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: { usage: 0, limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
        account: { current_plan: "Bootstrap", plan_usage: 0, plan_limit: 1000, paygo_usage: 0, paygo_limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.check();
    expect(result.enabled).toBe(true);
    expect(result.message).toBe("ok");
  });

  it("returns disabled when key limit is almost reached", async () => {
    const tavily = new Tavily();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: { usage: 995, limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
        account: { current_plan: "Bootstrap", plan_usage: 0, plan_limit: 1000, paygo_usage: 0, paygo_limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.check();
    expect(result.enabled).toBe(false);
    expect(result.message).toBe("key limit is almost reached");
  });

  it("returns disabled when plan limit is almost reached", async () => {
    const tavily = new Tavily();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: { usage: 0, limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
        account: { current_plan: "Bootstrap", plan_usage: 995, plan_limit: 1000, paygo_usage: 0, paygo_limit: 1000, search_usage: 0, extract_usage: 0, crawl_usage: 0, map_usage: 0, research_usage: 0 },
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.check();
    expect(result.enabled).toBe(false);
    expect(result.message).toBe("plan limit is almost reached");
  });

  it("returns disabled when API key is missing", async () => {
    const originalEnv = process.env.TAVILY_SEARCH_API;
    delete process.env.TAVILY_SEARCH_API;
    const tavily = new Tavily();
    
    const result = await tavily.check();
    expect(result.enabled).toBe(false);
    expect(result.message).toContain("TAVILY_SEARCH_API");
    
    process.env.TAVILY_SEARCH_API = originalEnv;
  });

  it("returns disabled on HTTP failure", async () => {
    const tavily = new Tavily();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    const result = await tavily.check();
    expect(result.enabled).toBe(false);
    expect(result.message).toContain("401");
  });
});

describe("Tavily.search", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns error when not enabled", async () => {
    const tavily = new Tavily();
    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not enabled");
  });

  it("returns error when API key is missing", async () => {
    const originalEnv = process.env.TAVILY_SEARCH_API;
    delete process.env.TAVILY_SEARCH_API;
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("TAVILY_SEARCH_API");
    
    process.env.TAVILY_SEARCH_API = originalEnv;
  });

  it("returns search results on success", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "Title", url: "https://example.com", content: "Snippet" },
        ],
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        title: "Title",
        url: "https://example.com",
        snippet: "Snippet",
      });
    }
  });

  it("returns error on HTTP failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error on JSON parse failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("Invalid JSON"); },
      text: async () => "",
    } as Response);

    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("returns empty results when Tavily returns no results", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
      text: async () => "",
    } as Response);

    const result = await tavily.search("test", 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(0);
    }
  });
});

describe("Tavily.fetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns error when not enabled", async () => {
    const tavily = new Tavily();
    const result = await tavily.fetch("https://example.com", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not enabled");
  });

  it("fetches raw HTML when raw=true", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>Hello</html>",
      headers: new Headers({ "content-type": "text/html" }),
    } as Response);

    const result = await tavily.fetch("https://example.com", true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.text).toBe("<html>Hello</html>");
      expect(result.response.contentType).toBe("text/html");
    }
  });

  it("returns error on raw fetch HTTP failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    } as Response);

    const result = await tavily.fetch("https://example.com", true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("404");
  });

  it("returns error on raw fetch network failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await tavily.fetch("https://example.com", true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("uses Tavily extract when raw=false", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", raw_content: "Extracted text" }],
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.fetch("https://example.com", false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.text).toBe("Extracted text");
      expect(result.response.contentType).toBe("text/plain");
    }
  });

  it("returns error on Tavily extract HTTP failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    } as Response);

    const result = await tavily.fetch("https://example.com", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error on Tavily extract failure", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        failed_results: [{ url: "https://example.com", error: "blocked" }],
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.fetch("https://example.com", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("blocked");
  });

  it("returns error when no content returned", async () => {
    const tavily = new Tavily();
    (tavily as any).enabled = true;
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [],
      }),
      text: async () => "",
    } as Response);

    const result = await tavily.fetch("https://example.com", false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no content");
  });
});
