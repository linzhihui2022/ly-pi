import { isAbsolute, relative, sep } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { VisibleWorktree } from "./worktrees";

const HEADING = "Worktrees";
const HEADING_GLYPH = "●";
const CURRENT_GLYPH = "•";
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

/** Render the current visible worktree as a Todo-style tree above the editor. */
export function renderWorktreeLines(
  theme: Theme,
  worktrees: VisibleWorktree[],
  width: number,
  repositoryRoot: string,
): string[] {
  const currentWorktrees = worktrees.filter((worktree) => worktree.isCurrent);
  const [worktree] = currentWorktrees;
  if (
    width <= 0 ||
    worktrees.length < 2 ||
    !worktree ||
    currentWorktrees.length !== 1
  ) {
    return [];
  }
  const branch = "└─ ";
  const label = `${CURRENT_GLYPH} ${worktree.label}`;
  const displayPath = abbreviateRepositoryPath(worktree.path, repositoryRoot);
  const pathWidth = width - visibleWidth(`${branch}${label} `);
  const path = truncatePathStart(displayPath, pathWidth);
  if (path === "" || path === "…") return [];

  const truncate = (line: string): string => truncateToWidth(line, width);
  const heading = `${theme.fg("accent", HEADING_GLYPH)} ${theme.fg(
    "accent",
    `${HEADING} (${worktrees.length})`,
  )}`;

  return [
    truncate(heading),
    truncate(
      `${theme.fg("dim", branch)}${theme.fg("text", label)}${theme.fg("dim", ` ${path}`)}`,
    ),
  ];
}
