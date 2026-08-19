import { isAbsolute, relative, sep } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { VisibleWorktree } from "./worktrees";

const HEADING = "Worktrees";
const CURRENT_GLYPH = "●";
const OTHER_GLYPH = "○";
const REPOSITORY_TOKEN = "<REPO>";

function abbreviateRepositoryPath(
  path: string,
  repositoryRoot: string,
): string {
  const pathFromRoot = relative(repositoryRoot, path);
  if (pathFromRoot === "") return REPOSITORY_TOKEN;
  if (
    !isAbsolute(pathFromRoot) &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`)
  ) {
    return `${REPOSITORY_TOKEN}${sep}${pathFromRoot}`;
  }
  return path;
}

function truncatePathStart(path: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(path) <= width) return path;
  if (width === 1) return "…";

  let suffix = "";
  for (const character of [...path].reverse()) {
    if (visibleWidth(`…${character}${suffix}`) > width) break;
    suffix = `${character}${suffix}`;
  }
  return `…${suffix}`;
}

/** Render visible worktrees as a Todo-style tree above the editor. */
export function renderWorktreeLines(
  theme: Theme,
  worktrees: VisibleWorktree[],
  width: number,
  repositoryRoot: string,
): string[] {
  if (width <= 0 || worktrees.length === 0) return [];

  const truncate = (line: string): string => truncateToWidth(line, width);
  const heading = `${theme.fg("accent", CURRENT_GLYPH)} ${theme.fg(
    "accent",
    `${HEADING} (${worktrees.length})`,
  )}`;
  const lines = [truncate(heading)];

  for (const [index, worktree] of worktrees.entries()) {
    const branch = index === worktrees.length - 1 ? "└─ " : "├─ ";
    const glyph = worktree.isCurrent ? CURRENT_GLYPH : OTHER_GLYPH;
    const label = `${glyph} ${worktree.label}`;
    const displayPath = abbreviateRepositoryPath(worktree.path, repositoryRoot);
    const pathWidth = Math.max(0, width - visibleWidth(`${branch}${label} `));
    const path = truncatePathStart(displayPath, pathWidth);
    const styledLabel = theme.fg(worktree.isCurrent ? "accent" : "dim", label);

    lines.push(
      truncate(
        `${theme.fg("dim", branch)}${styledLabel}${theme.fg("dim", ` ${path}`)}`,
      ),
    );
  }

  return lines;
}
