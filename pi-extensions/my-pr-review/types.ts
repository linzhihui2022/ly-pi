export interface PrInfo {
  number: number;
  repo: string;
  owner: string;
  title: string;
  url: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffSummary {
  totalFiles: number;
  additions: number;
  deletions: number;
  changedFiles: ChangedFile[];
}

export type Severity = "info" | "warning" | "critical";

export interface ReviewFinding {
  type: string;
  file: string;
  line?: number;
  severity: Severity;
  description: string;
}

export interface ReviewResult {
  findings: ReviewFinding[];
  summary: Record<string, unknown>;
  notes?: string;
}

export interface WorktreeInfo {
  created: boolean;
  path?: string;
  branch?: string;
  base?: string;
}

export interface PrReviewConfig {
  enabled: boolean;
  ghCli: string;
  worktree: {
    enabled: boolean;
    prefix: string;
    autoCleanup: boolean;
    cleanupOnSessionEnd: boolean;
  };
  reviewers: Record<string, { enabled: boolean }>;
  limits: {
    maxDiffSizeKB: number;
    maxFilesPerReview: number;
    testTimeoutMs: number;
  };
}
