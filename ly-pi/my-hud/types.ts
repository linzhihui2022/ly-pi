/**
 * Shared types for my-hud.
 */

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface GitStatus {
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  stashed: number;
  conflicted: number;
  isClean: boolean;
}

export interface PullRequestInfo {
  number: number;
  url: string;
}

export interface StatusLineData {
  project: string;
  modelName: string;
  branch: string | null;
  ctxColored: string;
  usage: TokenUsage;
  gitStatus?: GitStatus | null;
  pullRequest?: PullRequestInfo | null;
}
