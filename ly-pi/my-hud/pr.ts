/**
 * GitHub Pull Request detection for the current branch.
 */

import { exec, execFile } from "node:child_process";
import type { PullRequestInfo } from "./types";

const execAsync = (
  command: string,
  options: { cwd: string; timeout: number },
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve({ stdout: stdout, stderr: stderr });
      }
    });
  });

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Parse `gh pr view --json number,url` stdout.
 */
export function parseGhPrOutput(stdout: string): PullRequestInfo | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { number?: unknown; url?: unknown };
    if (typeof parsed.number === "number" && typeof parsed.url === "string") {
      return { number: parsed.number, url: parsed.url };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a git remote URL into owner/repo for GitHub remotes.
 */
export function parseRemoteUrl(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = trimmed.match(
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    const [, owner, repoWithGit] = httpsMatch;
    return {
      owner,
      repo: repoWithGit?.replace(/\.git$/, ""),
    };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, owner, repoWithGit] = sshMatch;
    return { owner, repo: repoWithGit?.replace(/\.git$/, "") };
  }

  return null;
}

/**
 * Get the remote URL for a branch.
 * Uses the branch's tracking remote if available, otherwise falls back to origin.
 */
export async function getRemoteUrl(
  cwd: string,
  branch: string,
): Promise<string | null> {
  try {
    const { stdout: remoteNameOut } = await execAsync(
      `git config --get branch.${branch}.remote`,
      { cwd, timeout: 3000 },
    );
    const remoteName = remoteNameOut.trim();
    const targetRemote = remoteName || "origin";

    const { stdout: remoteUrlOut } = await execAsync(
      `git remote get-url ${targetRemote}`,
      { cwd, timeout: 3000 },
    );
    return remoteUrlOut.trim();
  } catch {
    return null;
  }
}

/**
 * Fetch the pull request number and URL for the given branch.
 * Tries `gh` CLI first, then falls back to GitHub API using the provided token.
 */
export async function getPullRequestNumber(
  cwd: string,
  branch: string,
  owner: string,
  repo: string,
  token?: string,
): Promise<PullRequestInfo | null> {
  try {
    const { stdout } = await execAsync("gh pr view --json number,url", {
      cwd,
      timeout: 5000,
    });
    const pr = parseGhPrOutput(stdout);
    if (pr) return pr;
  } catch {
    // fall through to API fallback
  }

  if (!token) return null;

  try {
    const encodedBranch = encodeURIComponent(branch);
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls?head=${owner}:${encodedBranch}&state=all`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
      number?: unknown;
      html_url?: unknown;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    if (
      typeof first?.number === "number" &&
      typeof first?.html_url === "string"
    ) {
      return { number: first.number, url: first.html_url };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the name of the current git branch.
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git branch --show-current", {
      cwd,
      timeout: 3000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Fetch the pull request for the current branch.
 * Convenience wrapper that discovers branch, remote, owner and repo.
 */
export async function getPullRequestForCurrentBranch(
  cwd: string,
  token?: string,
): Promise<PullRequestInfo | null> {
  const branch = await getCurrentBranch(cwd);
  if (!branch) return null;

  const remoteUrl = await getRemoteUrl(cwd, branch);
  if (!remoteUrl) return null;

  const repo = parseRemoteUrl(remoteUrl);
  if (!repo) return null;

  return getPullRequestNumber(cwd, branch, repo.owner, repo.repo, token);
}

/**
 * Open a URL in the system default browser.
 * Resolves when the command is spawned successfully.
 */
export function openUrl(url: string): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  return new Promise((resolve, reject) => {
    execFile(command, [url], (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
