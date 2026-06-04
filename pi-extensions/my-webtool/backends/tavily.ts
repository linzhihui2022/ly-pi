import {
  FetchResponse,
  FetchProvider,
  SearchProvider,
  SearchResponse,
  SearchResult,
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

  constructor() {
    this.tavilyApiKey = process.env.TAVILY_SEARCH_API || "";
  }

  async check(): Promise<{ enabled: boolean; message: string }> {
    try {
      const usage = await this.usage();
      if (usage.key.limit - usage.key.usage < 10) {
        this.enabled = false;
        return { enabled: false, message: "key limit is almost reached" };
      }
      if (usage.account.plan_limit - usage.account.plan_usage < 10) {
        this.enabled = false;
        return { enabled: false, message: "plan limit is almost reached" };
      }
      this.enabled = true;
      return { enabled: true, message: "ok" };
    } catch (error) {
      this.enabled = false;
      return { enabled: false, message: error instanceof Error ? error.message : "unknown error" };
    }
  }

  private async usage() {
    if (!this.tavilyApiKey) {
      throw new Error("TAVILY_SEARCH_API is not set");
    }
    const res = await fetch(`${TAVILY_BASE_URL}/usage`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tavilyApiKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(
        `${this.label} Usage API error (${res.status}): ${await res.text()}`
      );
    }
    return (await res.json()) as TavilyUsageResponse;
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
