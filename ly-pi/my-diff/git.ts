/**
 * Git status listing and diff fetching for /diff.
 */

import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ChangedFile } from "./types";

const execAsync = promisify(exec);

/**
 * Parse `git status --porcelain` (v1) output into changed files.
 * Tracked entries only in ticket 01; untracked (??) arrives in ticket 02.
 * Any tracked state that is not a pure add maps to "M"
 * (modified/deleted/renamed/conflicted are all "changed vs HEAD").
 */
export function parseStatusList(porcelain: string): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();

  for (const line of porcelain.split("\n")) {
    if (line.length < 4) continue;
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    if (x === "!") continue; // ignored
    if (x === " " && y === " ") continue;

    const rawPath = line.slice(3);
    // Renames/copies: "old -> new" — the file to diff is the new path.
    const arrow = rawPath.indexOf(" -> ");
    const path = unquote(arrow === -1 ? rawPath : rawPath.slice(arrow + 4));
    if (!path) continue;

    const status = x === "?" ? "?" : x === "A" || y === "A" ? "A" : "M";
    byPath.set(path, { status, path });
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Unquote C-style quoted path from porcelain output. */
function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  return path
    .slice(1, -1)
    .replace(/\\(.)/g, (_m, ch: string) => (ch === "n" ? "\n" : ch));
}

/**
 * Fetch changed files for cwd, or null when not a git repo / git unavailable.
 */
export async function fetchChangedFiles(
  cwd: string,
): Promise<ChangedFile[] | null> {
  try {
    const { stdout } = await execAsync("git status --porcelain", {
      cwd,
      timeout: 3000,
    });
    return parseStatusList(stdout);
  } catch {
    return null;
  }
}

/** Read an untracked file's full text (its "diff" is its whole content). */
export async function fetchUntrackedContent(
  cwd: string,
  path: string,
): Promise<string> {
  return readFile(join(cwd, path), "utf8");
}

/** Fetch `git diff HEAD -- <path>` for a tracked file. */
export async function fetchDiffHead(
  cwd: string,
  path: string,
): Promise<string> {
  const { stdout } = await execAsync(
    `git diff HEAD -- ${JSON.stringify(path)}`,
    { cwd, timeout: 5000, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}
