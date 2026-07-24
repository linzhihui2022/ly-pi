/**
 * Status line assembly.
 */

import {
  getCapabilities,
  hyperlink,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { icon } from "./icons";
import {
  formatTokens,
  shortModelName,
  formatCacheRate,
  formatPermissionStats,
} from "./format";
import type { StatusLineData, GitStatus } from "./types";

export function buildStatusLine(
  theme: Theme,
  width: number,
  data: StatusLineData,
): string {
  const {
    project: rawProject,
    modelName,
    branch,
    ctxColored,
    usage,
    gitStatus,
    pullRequest,
    judgeStats,
  } = data;
  const project =
    rawProject.length > 10 ? rawProject.slice(0, 8) + ".." : rawProject;
  const parts: string[] = [
    theme.fg("mdCode", `${icon("project")}${project}`),
    theme.fg(
      "mdHeading",
      `${icon("model")}${shortModelName(modelName.trim())}`,
    ),
  ];

  if (branch) {
    const branchPrefix = theme.fg(
      "customMessageLabel",
      `${icon("branch")}${branch}`,
    );
    let branchText = branchPrefix;

    if (pullRequest?.number) {
      const prLabel = `#${pullRequest.number}`;
      const coloredPr = theme.fg("customMessageLabel", prLabel);
      const clickablePr = getCapabilities().hyperlinks
        ? hyperlink(coloredPr, pullRequest.url)
        : coloredPr;
      branchText += clickablePr;
    }

    parts.push(branchText);
    const gitStatusStr = formatGitStatus(theme, gitStatus);
    if (gitStatusStr) {
      parts.push(gitStatusStr);
    }
  }

  parts.push(
    ctxColored,
    theme.fg("mdListBullet", `${icon("input")}${formatTokens(usage.input)}`),
    theme.fg("thinkingLow", `${icon("output")}${formatTokens(usage.output)}`),
    theme.fg(
      "thinkingMedium",
      `${icon("cacheRead")}${formatTokens(usage.cacheRead)}`,
    ),
    theme.fg("toolDiffRemoved", `${icon("cost")}${usage.cost.toFixed(2)}`),
    theme.fg(
      "accent",
      `${icon("cacheRate")}${formatCacheRate(usage.input, usage.cacheRead)}`,
    ),
  );

  const permissionStats = formatPermissionStats(judgeStats);
  if (permissionStats) {
    parts.push(
      theme.fg("accent", `${icon("shield")}${judgeStats!.allowed}`) +
        theme.fg("dim", "/") +
        theme.fg("error", `${judgeStats!.denied}`),
    );
  }

  return truncateToWidth(parts.join(" "), width);
}

/**
 * Format GitStatus into a colored string matching starship git_status style.
 * Returns empty string if status is null or clean.
 */
export function formatGitStatus(
  theme: Theme,
  status: GitStatus | null | undefined,
): string {
  if (!status || status.isClean) return "";

  const parts: string[] = [];

  if (status.staged > 0) {
    parts.push(theme.fg("accent", `++${status.staged}`) + "|");
  }
  if (status.unstaged > 0) {
    parts.push(theme.fg("warning", `~${status.unstaged}`) + "|");
  }
  if (status.untracked > 0) {
    parts.push(theme.fg("dim", `?${status.untracked}`) + "|");
  }
  if (status.stashed > 0) {
    parts.push(theme.fg("warning", `*${status.stashed}`) + "|");
  }
  if (status.conflicted > 0) {
    parts.push(theme.fg("error", `!!${status.conflicted}`) + "|");
  }
  if (status.ahead > 0 && status.behind > 0) {
    parts.push(theme.fg("warning", `⇕⇡${status.ahead}⇣${status.behind}`));
  } else if (status.ahead > 0) {
    parts.push(theme.fg("accent", `⇡${status.ahead}`));
  } else if (status.behind > 0) {
    parts.push(theme.fg("warning", `⇣${status.behind}`));
  }

  return parts.join("");
}
