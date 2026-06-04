import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  ExtensionAPI,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  MIN_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS,
  DEFAULT_SEARCH_RESULTS,
  clampSearchResultCount,
  spillFullContentToTempFile,
} from "./helper";
import { Tavily } from "./backends/tavily";
import {
  buildEmptyResultsEnvelope,
  formatFetchHeader,
  formatSearchResultsBody,
  formatTruncationFooter,
  renderFetchedContentPreview,
  renderSearchResultsPreview,
} from "./render";
import { Text } from "@earendil-works/pi-tui";
import { FetchDetails, SearchResult } from "./types";
import { writeFile } from "fs/promises";
import { loadConfig } from "./config";

export default function myWebtool(pi: ExtensionAPI): void {
  loadConfig();
  const tavily = new Tavily();
  const providerStatus = {
    tavily: { enabled: false, message: "" },
  };
  pi.on("session_start", async () => {
    const check = await tavily.check();
    providerStatus.tavily.enabled = check.enabled;
    providerStatus.tavily.message = check.message;
  });
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for information. Returns a list of results with titles, URLs, and snippets. Use when you need current information not in your training data.",
    promptSnippet: "Search the web for up-to-date information",
    promptGuidelines: [
      "Use web_search for information beyond your training data — recent events, current library versions, live API documentation.",
      'Use the current year from "Current date:" in your context when searching for recent information or documentation.',
      'After answering using search results, include a "Sources:" section listing relevant URLs as markdown hyperlinks: [Title](URL). Never skip this.',
      "Domain filtering is supported to include or block specific websites.",
      "If Tavily is not enabled, skip this tool call.",
    ],
    executionMode: "parallel",
    parameters: Type.Object({
      query: Type.String({
        description: "The search query. Be specific and use natural language.",
      }),
      max_results: Type.Optional(
        Type.Number({
          description: `Maximum number of results to return (${MIN_SEARCH_RESULTS}-${MAX_SEARCH_RESULTS}). Default: ${DEFAULT_SEARCH_RESULTS}.`,
          default: DEFAULT_SEARCH_RESULTS,
          minimum: MIN_SEARCH_RESULTS,
          maximum: MAX_SEARCH_RESULTS,
        })
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!providerStatus.tavily.enabled) {
        return buildEmptyResultsEnvelope(
          params.query,
          tavily.label,
          providerStatus.tavily.message || "Tavily is not enabled"
        );
      }

      const maxResults = clampSearchResultCount(params.max_results);
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Searching ${tavily.label} for: "${params.query}"...`,
          },
        ],
        details: { query: params.query, backend: tavily.label, resultCount: 0 },
      });

      const response = await tavily.search(params.query, maxResults, signal);
      if (!response.ok) {
        await writeFile(
          `/tmp/kimi-search-${Date.now()}.json`,
          JSON.stringify(
            { response, api: process.env.KIMI_SEARCH_API },
            null,
            2
          )
        );

        return buildEmptyResultsEnvelope(
          params.query,
          tavily.label,
          response.error
        );
      }

      if (response.results.length === 0) {
        return buildEmptyResultsEnvelope(params.query, tavily.label);
      }

      return {
        content: [{ type: "text", text: formatSearchResultsBody(response) }],
        details: {
          query: params.query,
          backend: tavily.label,
          resultCount: response.results.length,
          results: response.results,
        },
      };
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("WebSearch "));
      text += theme.fg("accent", `"${args.query}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Searching..."), 0, 0);
      }
      const details = result.details as {
        resultCount?: number;
        results?: SearchResult[];
      };
      const count = details?.resultCount ?? 0;
      let text = theme.fg(
        "success",
        `✓ ${count} result${count !== 1 ? "s" : ""}`
      );
      if (expanded && details?.results) {
        text += renderSearchResultsPreview(details.results, theme);
      }
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch the content of a specific URL. Returns text content for HTML pages (tags stripped), raw text for plain text or JSON. Supports http and https only. Content is truncated to avoid overwhelming the context window.",
    promptSnippet: "Fetch and read content from a specific URL",
    promptGuidelines: [
      "Use web_fetch to read the full content of a specific URL — documentation pages, blog posts, API references found via web_search.",
      "web_fetch is complementary to web_search: search finds URLs, fetch reads them.",
      'After answering using fetched content, include a "Sources:" section with a markdown hyperlink to the fetched URL.',
      "Large responses are truncated and spilled to a temp file — the temp path is reported in the result details.",
      "If Tavily is not enabled, skip this tool call.",
    ],
    executionMode: "parallel",
    parameters: Type.Object({
      url: Type.String({
        description: "The URL to fetch. Must be http or https.",
      }),
      raw: Type.Optional(
        Type.Boolean({
          description:
            "If true, return the raw HTML instead of extracted text. Default: false.",
          default: false,
        })
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!providerStatus.tavily.enabled) {
        return {
          content: [
            {
              type: "text",
              text: `Tavily is not enabled: ${providerStatus.tavily.message || "unknown reason"}`,
            },
          ],
          details: { url: params.url, error: "Tavily is not enabled" },
        };
      }

      const { url, raw = false } = params;

      onUpdate?.({
        content: [{ type: "text", text: `Fetching: ${url}...` }],
        details: { url } satisfies FetchDetails,
      });

      const fetchResponse = await tavily.fetch(url, raw, signal);
      if (!fetchResponse.ok) {
        return {
          content: [{ type: "text", text: fetchResponse.error }],
          details: { url, error: fetchResponse.error },
        };
      }
      const { response } = fetchResponse;
      const { text: bodyText, contentType } = response;

      const truncation = truncateHead(bodyText, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      const details: FetchDetails = { url, contentType };

      let output = truncation.content;
      if (truncation.truncated) {
        const tempFile = await spillFullContentToTempFile(bodyText);
        details.truncation = truncation;
        details.fullOutputPath = tempFile;
        output += formatTruncationFooter(truncation, tempFile);
      }

      return {
        content: [
          {
            type: "text",
            text: formatFetchHeader(url, contentType ?? "") + output,
          },
        ],
        details,
      };
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("WebFetch "));
      text += theme.fg("accent", args.url);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Fetching..."), 0, 0);
      }
      const details = result.details as FetchDetails | undefined;
      let text = theme.fg("success", "✓ Fetched");
      if (details?.title) text += theme.fg("muted", `: ${details.title}`);
      if (details?.truncation?.truncated)
        text += theme.fg("warning", " (truncated)");
      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          text += renderFetchedContentPreview(content.text, theme);
        }
      }
      return new Text(text, 0, 0);
    },
  });
}
