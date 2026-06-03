/**
 * Git status fetching and parsing.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

export interface GitStatus {
  ahead: number;
  behind: number;
  staged: number;
  stashed: number;
  conflicted: number;
  isClean: boolean;
}

const execAsync = promisify(exec);

/**
 * Fetch git status for the given directory.
 * Returns null if not a git repo or git is unavailable.
 */
export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
  try {
    const [statusResult, stashResult] = await Promise.all([
      execAsync("git status --porcelain=v2 --branch", { cwd, timeout: 3000 }),
      execAsync("git stash list", { cwd, timeout: 3000 }),
    ]);
    return parseGitStatus(statusResult.stdout, stashResult.stdout);
  } catch {
    return null;
  }
}

/**
 * Parse git status --porcelain=v2 --branch output.
 */
export function parseGitStatus(statusOutput: string, stashOutput: string): GitStatus {
  const lines = statusOutput.split("\n");

  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let conflicted = 0;

  for (const line of lines) {
    if (line.startsWith("# branch.ab")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";

      if (x === "U" || y === "U") {
        conflicted++;
      } else if (x !== "." && x !== "?" && x !== "!") {
        staged++;
      }
    }
  }

  const stashed = stashOutput.trim() ? stashOutput.trim().split("\n").length : 0;
  const isClean = ahead === 0 && behind === 0 && staged === 0 && stashed === 0 && conflicted === 0;

  return { ahead, behind, staged, stashed, conflicted, isClean };
}
