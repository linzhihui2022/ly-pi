import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileTree } from "./types";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".turbo",
  ".worktree",
  ".worktrees",
  ".pi-subagents",
]);

function walk(root: string, dir: string, out: Map<string, string>): void {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(root, rel, out);
    } else if (entry.isFile()) {
      out.set(
        rel,
        entry.name.endsWith(".md") ? readFileSync(join(root, rel), "utf8") : "",
      );
    }
  }
}

export function buildFileTree(root: string): FileTree {
  const out = new Map<string, string>();
  walk(root, "", out);
  return out;
}

export function isTriageSkillInstalled(skillsDirs: string[]): boolean {
  for (const dir of skillsDirs) {
    try {
      if (readdirSync(dir).includes("triage")) return true;
    } catch {
      // missing skills dir — not installed there
    }
  }
  return false;
}
