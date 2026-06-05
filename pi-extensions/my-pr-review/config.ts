import { readFileSync } from "node:fs";
import type { PrReviewConfig } from "./types";

export const defaultConfig: PrReviewConfig = {
  enabled: true,
  ghCli: "gh",
  worktree: {
    enabled: true,
    prefix: "{repo}-pr-{number}-review",
    autoCleanup: true,
    cleanupOnSessionEnd: true,
  },
  reviewers: {
    review_tests: { enabled: true },
    review_error_handling: { enabled: true },
    review_code_quality: { enabled: true },
    review_comments: { enabled: true },
    review_type_design: { enabled: true },
    review_simplification: { enabled: true },
  },
  limits: {
    maxDiffSizeKB: 500,
    maxFilesPerReview: 100,
    testTimeoutMs: 30000,
  },
};

export function loadConfig(configPath: string): PrReviewConfig {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const custom = JSON.parse(raw) as Partial<PrReviewConfig>;
    return mergeConfig(defaultConfig, custom);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...defaultConfig };
    }
    throw err;
  }
}

function mergeConfig(
  base: PrReviewConfig,
  custom: Partial<PrReviewConfig>
): PrReviewConfig {
  return {
    enabled: custom.enabled ?? base.enabled,
    ghCli: custom.ghCli ?? base.ghCli,
    worktree: { ...base.worktree, ...custom.worktree },
    reviewers: { ...base.reviewers, ...custom.reviewers },
    limits: { ...base.limits, ...custom.limits },
  };
}
