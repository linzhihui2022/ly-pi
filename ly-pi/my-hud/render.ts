/**
 * Status line assembly.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  hyperlink,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import {
  formatCacheRate,
  formatPermissionStats,
  formatTokens,
  shortModelName,
} from "./format";
import { icon } from "./icons";
import type { GitStatus, StatusLineData } from "./types";

let hiddenFields = new Set<string>();

/** Install fields to hide from the status line (from my-hud.json). */
export function setHiddenFields(fields: string[]): void {
  hiddenFields = new Set(fields);
}

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
  const show = (field: string): boolean => !hiddenFields.has(field);
  const project =
    rawProject.length > 10 ? `${rawProject.slice(0, 8)}..` : rawProject;
  const parts: string[] = [];
  if (show("project")) {
    parts.push(theme.fg("mdCode", `${icon("project")}${project}`));
  }
  if (show("model")) {
    parts.push(
      theme.fg(
        "mdHeading",
        `${icon("model")}${shortModelName(modelName.trim())}`,
      ),
    );
  }

  if (branch && show("branch")) {
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
  }
  if (branch && show("gitStatus")) {
    const gitStatusStr = formatGitStatus(theme, gitStatus);
    if (gitStatusStr) {
      parts.push(gitStatusStr);
    }
  }

  if (show("context")) {
    parts.push(ctxColored);
  }
  if (show("input")) {
    parts.push(
      theme.fg("mdListBullet", `${icon("input")}${formatTokens(usage.input)}`),
    );
  }
  if (show("output")) {
    parts.push(
      theme.fg("thinkingLow", `${icon("output")}${formatTokens(usage.output)}`),
    );
  }
  if (show("cacheRead")) {
    parts.push(
      theme.fg(
        "thinkingMedium",
        `${icon("cacheRead")}${formatTokens(usage.cacheRead)}`,
      ),
    );
  }
  if (show("cost")) {
    parts.push(
      theme.fg("toolDiffRemoved", `${icon("cost")}${usage.cost.toFixed(2)}`),
    );
  }
  if (show("cacheRate")) {
    parts.push(
      theme.fg(
        "accent",
        `${icon("cacheRate")}${formatCacheRate(usage.input, usage.cacheRead)}`,
      ),
    );
  }

  const permissionStats = formatPermissionStats(judgeStats);
  if (show("permission") && permissionStats) {
    let stat =
      theme.fg("accent", `${icon("shield")}${judgeStats?.allowed}`) +
      theme.fg("dim", "/") +
      theme.fg("error", `${judgeStats?.denied}`);
    if (
      typeof data.judgeCost === "number" &&
      data.judgeCost > 0 &&
      show("cost")
    ) {
      stat +=
        theme.fg("dim", "/") +
        theme.fg("thinkingMedium", data.judgeCost.toFixed(2));
    }
    parts.push(stat);
  }

  if (show("log") && data.logEnabled) {
    parts.push(theme.fg("accent", `${icon("log")}LOG`));
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
    parts.push(`${theme.fg("accent", `++${status.staged}`)}|`);
  }
  if (status.unstaged > 0) {
    parts.push(`${theme.fg("warning", `~${status.unstaged}`)}|`);
  }
  if (status.untracked > 0) {
    parts.push(`${theme.fg("dim", `?${status.untracked}`)}|`);
  }
  if (status.stashed > 0) {
    parts.push(`${theme.fg("warning", `*${status.stashed}`)}|`);
  }
  if (status.conflicted > 0) {
    parts.push(`${theme.fg("error", `!!${status.conflicted}`)}|`);
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
