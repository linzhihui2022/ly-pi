import { FETCH_PREVIEW_LINE_LIMIT } from "./helper";
import { SearchResult, UsageResponse } from "./types";
import {
  TruncationResult,
  formatSize,
  type Theme,
} from "@earendil-works/pi-coding-agent";

export function buildEmptyResultsEnvelope(
  query: string,
  providerName: string,
  error?: string
) {
  return {
    content: [
      {
        type: "text" as const,
        text: `No results found for "${query}".${
          error ? ` Error: ${error}` : ""
        }`,
      },
    ],
    details: { query, backend: providerName, resultCount: 0 },
  };
}

export function formatSearchResultsBody(response: {
  query: string;
  results: SearchResult[];
}): string {
  let text = `**Search results for "${response.query}":**\n\n`;
  response.results.forEach((r, i) => {
    text += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}\n\n`;
  });
  return text.trimEnd();
}

const SEARCH_RESULT_PREVIEW_LIMIT = 5;

export function renderSearchResultsPreview(
  results: SearchResult[],
  theme: Theme
): string {
  let text = "";
  for (const r of results.slice(0, SEARCH_RESULT_PREVIEW_LIMIT)) {
    text += `\n  ${theme.fg("dim", `• ${r.title}`)}`;
  }
  if (results.length > SEARCH_RESULT_PREVIEW_LIMIT) {
    text += `\n  ${theme.fg(
      "dim",
      `... and ${results.length - SEARCH_RESULT_PREVIEW_LIMIT} more`
    )}`;
  }
  return text;
}

export function formatTruncationFooter(
  truncation: TruncationResult,
  tempFile: string
): string {
  const truncatedLines = truncation.totalLines - truncation.outputLines;
  const truncatedBytes = truncation.totalBytes - truncation.outputBytes;
  return (
    `\n\n[Content truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines` +
    ` (${formatSize(truncation.outputBytes)} of ${formatSize(
      truncation.totalBytes
    )}).` +
    ` ${truncatedLines} lines (${formatSize(truncatedBytes)}) omitted.` +
    ` Full content saved to: ${tempFile}]`
  );
}
export function formatFetchHeader(url: string, contentType: string): string {
  const lines = [`**Fetched:** ${url}`];
  if (contentType) lines.push(`**Content-Type:** ${contentType}`);
  return `${lines.join("\n")}\n\n`;
}

export function renderFetchedContentPreview(content: string, theme: Theme): string {
	const lines = content.split("\n");
	const visible = lines.slice(0, FETCH_PREVIEW_LINE_LIMIT);
	let text = "";
	for (const line of visible) {
		text += `\n  ${theme.fg("dim", line)}`;
	}
	if (lines.length > FETCH_PREVIEW_LINE_LIMIT) {
		text += `\n  ${theme.fg("muted", "... (use read tool to see full content)")}`;
	}
	return text;
}

export function formatUsageNotify(
  response: UsageResponse,
  label: string
): string {
  const key = response.key;
  const plan = response.plan;
  return `${label}: key ${key.usage}/${key.limit} used (${key.remaining} remaining); plan ${plan.usage}/${plan.limit} used (${plan.remaining} remaining)`;
}
