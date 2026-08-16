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
 * The command runs with `-c core.quotepath=false`, so paths arrive
 * unquoted as raw UTF-8 — no unescaping needed here.
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
    const path = arrow === -1 ? rawPath : rawPath.slice(arrow + 4);
    if (!path) continue;

    const status = x === "?" ? "?" : x === "A" || y === "A" ? "A" : "M";
    byPath.set(path, { status, path });
  }

  // Code-unit order: locale-independent, identical on every machine.
  return [...byPath.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

/**
 * Classify a `git status` failure: only git's own "not a git repository"
 * fatal means the cwd is outside a repo; everything else (timeout, killed,
 * missing binary) is a genuine failure the caller should surface.
 */
export function classifyStatusError(err: unknown): "not-repo" | "fatal" {
  return err instanceof Error && err.message.includes("not a git repository")
    ? "not-repo"
    : "fatal";
}

/**
 * Fetch changed files for cwd.
 * null = not a git repo; other failures (timeout, killed) throw.
 */
export async function fetchChangedFiles(
  cwd: string,
): Promise<ChangedFile[] | null> {
  try {
    const { stdout } = await execAsync(
      "git -c core.quotepath=false status --porcelain",
      { cwd, timeout: 3000 },
    );
    return parseStatusList(stdout);
  } catch (err) {
    if (classifyStatusError(err) === "not-repo") {
      return null;
    }
    throw err;
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
