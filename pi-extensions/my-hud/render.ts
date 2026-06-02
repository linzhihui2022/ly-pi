/**
 * Status line assembly.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { icon } from "./icons";
import { ModelName, formatTokens, shortModelName } from "./format";
import type { StatusLineData } from "./types";

export function buildStatusLine(
  theme: Theme,
  width: number,
  data: StatusLineData,
): string {
  const { project:rawProject, modelName, branch, ctxColored, usage } = data;
  const project = rawProject.length > 10 ? rawProject.slice(0, 8) + ".." : rawProject;
  const parts: string[] = [
    theme.fg("mdCode", `${icon("project")}${project}`),
    theme.fg("mdHeading", `${icon("model")}${shortModelName(modelName.trim() as ModelName)}`),
  ];

  if (branch) {
    parts.push(theme.fg("customMessageLabel", `${icon("branch")}${branch}`));
  }

  parts.push(
    ctxColored,
    theme.fg("mdListBullet", `${icon("input")}${formatTokens(usage.input)}`),
    theme.fg("thinkingLow", `${icon("output")}${formatTokens(usage.output)}`),
    theme.fg("thinkingMedium", `${icon("cacheRead")}${formatTokens(usage.cacheRead)}`),
    theme.fg("toolDiffRemoved", `${icon("cost")}${usage.cost.toFixed(2)}`),
  );

  return truncateToWidth(parts.join(" "), width);
}
