import { execFile } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

export interface ParsedWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  prunable: boolean;
  locked?: boolean;
}

const BRANCH_PREFIX = "refs/heads/";
const execFileAsync = promisify(execFile);

export interface VisibleWorktree {
  path: string;
  label: string;
  isCurrent: boolean;
}

export interface WorktreeSnapshot {
  repositoryRoot: string;
  worktrees: VisibleWorktree[];
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function containsPath(parent: string, child: string): boolean {
  const pathFromWorktree = relative(
    canonicalPath(parent),
    canonicalPath(child),
  );
  return (
    pathFromWorktree === "" ||
    (!isAbsolute(pathFromWorktree) &&
      pathFromWorktree !== ".." &&
      !pathFromWorktree.startsWith(`..${sep}`))
  );
}

export function findCurrentWorktree(
  entries: ParsedWorktree[],
  cwd: string,
): ParsedWorktree | undefined {
  return entries.reduce<ParsedWorktree | undefined>((current, entry) => {
    if (entry.prunable || !containsPath(entry.path, cwd)) return current;

    return !current ||
      canonicalPath(entry.path).length > canonicalPath(current.path).length
      ? entry
      : current;
  }, undefined);
}

/** Select worktrees that can be shown in Pi from parsed Git output. */
export function selectVisibleWorktrees(
  entries: ParsedWorktree[],
  cwd: string,
  isAccessible: (path: string) => boolean,
): VisibleWorktree[] {
  const currentPath = findCurrentWorktree(entries, cwd)?.path;

  return entries.flatMap((entry) => {
    const label = entry.branch ?? entry.head?.slice(0, 7);
    if (entry.prunable || !label || !isAccessible(entry.path)) return [];

    return [
      {
        path: entry.path,
        label,
        isCurrent: canonicalPath(entry.path) === currentPath,
      },
    ];
  });
}

/** Parse the stable machine-readable output from `git worktree list --porcelain`. */
export async function getVisibleWorktrees(
  cwd: string,
): Promise<WorktreeSnapshot | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd, timeout: 3000 },
    );
    const entries = parseWorktreeList(stdout);
    const repositoryRoot = entries[0]?.path;
    if (!repositoryRoot) return null;

    return {
      repositoryRoot,
      worktrees: selectVisibleWorktrees(entries, cwd, (path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      }),
    };
  } catch {
    return null;
  }
}

export function parseWorktreeList(output: string): ParsedWorktree[] {
  const worktrees: ParsedWorktree[] = [];
  let current: ParsedWorktree | undefined;

  const commit = (): void => {
    if (current) worktrees.push(current);
    current = undefined;
  };

  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.startsWith("worktree ")) {
      commit();
      current = {
        path: line.slice("worktree ".length),
        branch: null,
        head: null,
        prunable: false,
      };
      continue;
    }

    if (!current) continue;
    if (line === "") {
      commit();
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const branch = line.slice("branch ".length);
      current.branch = branch.startsWith(BRANCH_PREFIX)
        ? branch.slice(BRANCH_PREFIX.length)
        : branch;
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
    } else if (line.startsWith("locked")) {
      current.locked = true;
    }
  }

  commit();
  return worktrees;
}
