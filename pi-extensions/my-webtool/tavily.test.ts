import { describe, it, expect, vi, beforeEach } from "vitest";
import { Tavily } from "./backends/tavily";

describe("Tavily.usage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TAVILY_SEARCH_API;
  });

  it("returns usage data when API responds successfully", async () => {
    process.env.TAVILY_SEARCH_API = "test-key";
    const tavily = new Tavily();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(""),
        json: vi.fn().mockResolvedValue({
          key: {
            usage: 45,
            limit: 100,
            search_usage: 10,
            extract_usage: 5,
            crawl_usage: 0,
            map_usage: 0,
            research_usage: 0,
          },
          account: {
            current_plan: "Bootstrap",
            plan_usage: 30,
            plan_limit: 200,
            paygo_usage: 0,
            paygo_limit: 0,
            search_usage: 10,
            extract_usage: 5,
            crawl_usage: 0,
            map_usage: 0,
            research_usage: 0,
          },
        }),
      }),
    );

    const result = await tavily.usage();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.key.usage).toBe(45);
      expect(result.key.limit).toBe(100);
      expect(result.key.remaining).toBe(55);
      expect(result.plan.usage).toBe(30);
      expect(result.plan.limit).toBe(200);
      expect(result.plan.remaining).toBe(170);
    }
  });

  it("returns error when API key is missing", async () => {
    const tavily = new Tavily();
    const result = await tavily.usage();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("TAVILY_SEARCH_API is not set");
    }
  });

  it("returns error when API responds with non-200", async () => {
    process.env.TAVILY_SEARCH_API = "test-key";
    const tavily = new Tavily();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("Unauthorized"),
      }),
    );

    const result = await tavily.usage();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("401");
    }
  });

  it("returns error on network failure", async () => {
    process.env.TAVILY_SEARCH_API = "test-key";
    const tavily = new Tavily();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await tavily.usage();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Network error");
    }
  });

  it("returns generic error on non-Error throw", async () => {
    process.env.TAVILY_SEARCH_API = "test-key";
    const tavily = new Tavily();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("string error"));

    const result = await tavily.usage();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unknown error");
    }
  });
});
