import {
  FetchResponse,
  FetchProvider,
  SearchProvider,
  SearchResponse,
  SearchResult,
  UsageResponse,
} from "../types";

const TAVILY_BASE_URL = "https://api.tavily.com";

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
}
interface TavilyRawResponse {
  results?: TavilyRawResult[];
  detail?: string;
  error?: string;
}
interface TavilyExtractResult {
  url?: string;
  raw_content?: string;
}
interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failed_results?: Array<{ url?: string; error?: string }>;
}
interface TavilyUsageResponse {
  key: {
    usage: number;
    limit: number;
    search_usage: number;
    extract_usage: number;
    crawl_usage: number;
    map_usage: number;
    research_usage: number;
  };
  account: {
    current_plan: "Bootstrap";
    plan_usage: number;
    plan_limit: number;
    paygo_usage: number;
    paygo_limit: number;
    search_usage: number;
    extract_usage: number;
    crawl_usage: number;
    map_usage: number;
    research_usage: number;
  };
}

function normalizeTavilyResults(results: TavilyRawResult[]): SearchResult[] {
  return results.map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
  }));
}

export class Tavily implements SearchProvider, FetchProvider {
  readonly name = "tavily";
  readonly label = "Tavily";
  private tavilyApiKey: string;
  private enabled: boolean = false;
  private checking: boolean = false;

  constructor() {
    this.tavilyApiKey = process.env.TAVILY_SEARCH_API || "";
  }

  async check(): Promise<{ enabled: boolean; message: string }> {
    this.checking = true;
    const usage = await this.usage();
    if (!usage.ok) {
      this.enabled = false;
      this.checking = false;
      return { enabled: false, message: usage.error };
    }
    if (usage.key.limit - usage.key.usage < 10) {
      this.enabled = false;
      this.checking = false;
      return { enabled: false, message: "key limit is almost reached" };
    }
    if (usage.plan.limit - usage.plan.usage < 10) {
      this.enabled = false;
      this.checking = false;
      return { enabled: false, message: "plan limit is almost reached" };
    }
    this.enabled = true;
    this.checking = false;
    return { enabled: true, message: "ok" };
  }

  async usage(): Promise<UsageResponse | { ok: false; error: string }> {
    if (!this.tavilyApiKey) {
      return { ok: false, error: "TAVILY_SEARCH_API is not set" };
    }
    try {
      const res = await fetch(`${TAVILY_BASE_URL}/usage`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.tavilyApiKey}`,
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `${this.label} Usage API error (${res.status}): ${await res.text()}`,
        };
      }
      const data = (await res.json()) as TavilyUsageResponse;
      return {
        ok: true,
        key: {
          usage: data.key.usage,
          limit: data.key.limit,
          remaining: data.key.limit - data.key.usage,
        },
        plan: {
          usage: data.account.plan_usage,
          limit: data.account.plan_limit,
          remaining: data.account.plan_limit - data.account.plan_usage,
        },
        features: {
          search: { usage: data.key.search_usage, limit: data.key.limit },
          extract: { usage: data.key.extract_usage, limit: data.key.limit },
          crawl: { usage: data.key.crawl_usage, limit: data.key.limit },
          map: { usage: data.key.map_usage, limit: data.key.limit },
          research: { usage: data.key.research_usage, limit: data.key.limit },
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<SearchResponse> {
    if (!this.enabled) {
      return { query, error: "Tavily is not enabled", ok: false };
    }
    if (!this.tavilyApiKey) {
      return { query, error: "TAVILY_SEARCH_API is not set", ok: false };
    }
    const res = await fetch(`${TAVILY_BASE_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.tavilyApiKey,
        query,
        max_results: maxResults,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        query,
        error: `${this.label} Search API error (${res.status}): ${text}`,
        ok: false,
      };
    }
    try {
      const raw = (await res.json()) as TavilyRawResponse;
      return {
        query,
        results: normalizeTavilyResults(raw.results ?? []),
        ok: true,
      };
    } catch (error) {
      return {
        query,
        error: error instanceof Error ? error.message : "Unknown error",
        ok: false,
      };
    }
  }

  async fetch(
    url: string,
    raw: boolean,
    signal?: AbortSignal
  ): Promise<FetchResponse> {
    if (!this.enabled) {
      return { error: "Tavily is not enabled", ok: false };
    }
    if (!this.tavilyApiKey) {
      return { error: `TAVILY_SEARCH_API is not set`, ok: false };
    }

    if (raw) {
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) {
          return {
            error: `HTTP error (${res.status}): ${await res.text()}`,
            ok: false,
          };
        }
        const text = await res.text();
        const contentType = res.headers.get("content-type") ?? "text/html";
        return {
          response: { text, contentType },
          ok: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
          ok: false,
        };
      }
    }

    const res = await fetch(`${TAVILY_BASE_URL}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tavilyApiKey}`,
      },
      body: JSON.stringify({
        urls: [url],
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        error: `${this.label} Fetch API error (${res.status}): ${text}`,
        ok: false,
      };
    }

    const data = (await res.json()) as TavilyExtractResponse;

    if (data.failed_results && data.failed_results.length > 0) {
      const failed = data.failed_results[0];
      return {
        error: `extraction failed for ${failed.url ?? url}: ${
          failed.error ?? "unknown error"
        }`,
        ok: false,
      };
    }

    const result = data.results?.[0];
    if (!result?.raw_content) {
      return { error: `no content returned for ${url}`, ok: false };
    }

    return {
      response: {
        text: result.raw_content,
        contentType: "text/plain",
      },
      ok: true,
    };
  }
}
