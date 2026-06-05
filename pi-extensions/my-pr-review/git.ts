// git.ts
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { ChangedFile } from "./types";

export interface PrUrlInfo {
  owner: string;
  repo: string;
  number: number;
}

export function parsePrUrl(url: string): PrUrlInfo | null {
  const match = url.match(
    /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
  );
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}

export function isCurrentRepo(
  remotes: string,
  owner: string,
  repo: string
): boolean {
  const patterns = [
    new RegExp(`${owner}/${repo}\\.git`),
    new RegExp(`${owner}/${repo}(?!\\w)`),
  ];
  return patterns.some((p) => p.test(remotes));
}

export function getGitRemotes(cwd: string): string {
  try {
    return execSync("git remote -v", { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function buildWorktreePath(
  prefix: string,
  repo: string,
  number: number
): string {
  return prefix.replace("{repo}", repo).replace("{number}", String(number));
}

export function createWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  remoteBranch: string
): void {
  const absPath = resolve(cwd, "..", worktreePath);
  execSync(`git worktree add "${absPath}" "${remoteBranch}"`, {
    cwd,
    stdio: "pipe",
  });
  execSync(`git checkout -b "${branch}" "${remoteBranch}"`, {
    cwd: absPath,
    stdio: "pipe",
  });
}

export function removeWorktree(cwd: string, worktreePath: string): void {
  const absPath = resolve(cwd, "..", worktreePath);
  try {
    execSync(`git worktree remove "${absPath}" --force`, {
      cwd,
      stdio: "pipe",
    });
  } catch {
    // Best effort cleanup
  }
}

export function fetchPrDiff(
  prNumber: number,
  cwd?: string
): string {
  const cmd = `gh pr diff ${prNumber}`;
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function getPrInfo(
  prNumber: number,
  cwd?: string
): { title: string; headRefName: string; baseRefName: string } {
  const cmd = `gh pr view ${prNumber} --json title,headRefName,baseRefName`;
  const output = execSync(cmd, { cwd, encoding: "utf-8" });
  return JSON.parse(output);
}

export function checkGhInstalled(): boolean {
  try {
    execSync("gh --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function hasUncommittedChanges(cwd: string): boolean {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

export function recommendReviewers(files: ChangedFile[]): string[] {
  const reviewers = new Set<string>();
  const paths = files.map((f) => f.path);

  if (paths.some((p) => /\.(test|spec)\./.test(p) || /test/.test(p))) {
    reviewers.add("review_tests");
  }

  if (paths.some((p) => /\.(ts|js|tsx|jsx)$/.test(p))) {
    reviewers.add("review_error_handling");
    reviewers.add("review_code_quality");
    reviewers.add("review_simplification");
  }

  if (paths.some((p) => /\.(d\.ts|\.ts|\.tsx)$/.test(p))) {
    reviewers.add("review_type_design");
  }

  if (paths.some((p) => /\.(ts|js|tsx|jsx|py|rs|go)$/.test(p))) {
    reviewers.add("review_comments");
  }

  // Always include these for code files
  if (paths.some((p) => /\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(p))) {
    reviewers.add("review_code_quality");
    reviewers.add("review_simplification");
  }

  return Array.from(reviewers);
}
