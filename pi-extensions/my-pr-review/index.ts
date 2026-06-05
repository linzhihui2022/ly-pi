import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { loadConfig } from "./config";
import {
  parsePrUrl,
  isCurrentRepo,
  getGitRemotes,
  buildWorktreePath,
  createWorktree,
  removeWorktree,
  fetchPrDiff,
  getPrInfo,
  checkGhInstalled,
  hasUncommittedChanges,
  recommendReviewers,
} from "./git";
import { parseDiff } from "./parser";
import { reviewComments } from "./reviewers/comments";
import { reviewTests } from "./reviewers/tests";
import { reviewErrors } from "./reviewers/errors";
import { reviewTypes } from "./reviewers/types";
import { reviewQuality } from "./reviewers/quality";
import { reviewSimplification } from "./reviewers/simplification";
import { formatReviewResult } from "./render";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ChangedFile, WorktreeInfo } from "./types";

const EXT_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
})();

const CONFIG_PATH = join(EXT_DIR, "my-pr-review.json");

// Track active worktrees for cleanup
const activeWorktrees = new Map<number, string>();

export default function myPrReview(pi: ExtensionAPI): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(CONFIG_PATH);
  } catch {
    return;
  }

  if (!config.enabled) return;

  // ── Register Tools ──

  pi.registerTool({
    name: "review_pr",
    label: "Review PR",
    description:
      "Start a PR review. If the PR is for the current git repo, creates an isolated worktree branch for review. Returns diff summary and recommended reviewer tools.",
    parameters: Type.Object({
      pr_url: Type.String({
        description: "GitHub PR URL (e.g. https://github.com/owner/repo/pull/42)",
      }),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      if (!checkGhInstalled()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: gh CLI is required. Install: https://cli.github.com/",
            },
          ],
          details: { error: "gh CLI not found" },
        };
      }

      const prInfo = parsePrUrl(params.pr_url);
      if (!prInfo) {
        return {
          content: [
            { type: "text", text: "Error: Invalid PR URL format" },
          ],
          details: { error: "invalid URL" },
        };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Fetching PR #${prInfo.number}...` }],
        details: { prInfo },
      });

      let worktree: WorktreeInfo = { created: false };
      let diffText: string;
      let fullPrInfo: { title: string; headRefName: string; baseRefName: string };

      try {
        fullPrInfo = getPrInfo(prInfo.number, ctx.cwd);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching PR info: ${(err as Error).message}`,
            },
          ],
          details: { error: (err as Error).message },
        };
      }

      // Check if current repo matches PR repo
      const remotes = getGitRemotes(ctx.cwd);
      const isLocalRepo = isCurrentRepo(remotes, prInfo.owner, prInfo.repo);

      if (isLocalRepo && config.worktree.enabled) {
        if (hasUncommittedChanges(ctx.cwd)) {
          return {
            content: [
              {
                type: "text",
                text: "Warning: Uncommitted changes detected. Stash or commit before creating worktree.",
              },
            ],
            details: { warning: "uncommitted changes" },
          };
        }

        const worktreePath = buildWorktreePath(
          config.worktree.prefix,
          prInfo.repo,
          prInfo.number
        );

        try {
          createWorktree(
            ctx.cwd,
            worktreePath,
            `review/pr-${prInfo.number}`,
            `origin/${fullPrInfo.headRefName}`
          );
          worktree = {
            created: true,
            path: join(ctx.cwd, "..", worktreePath),
            branch: `review/pr-${prInfo.number}`,
            base: `origin/${fullPrInfo.baseRefName}`,
          };
          activeWorktrees.set(prInfo.number, worktreePath);
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating worktree: ${(err as Error).message}`,
              },
            ],
            details: { error: (err as Error).message },
          };
        }

        diffText = fetchPrDiff(prInfo.number, worktree.path);
      } else {
        diffText = fetchPrDiff(prInfo.number);
      }

      const diffSummary = parseDiff(diffText);
      const recommendedReviewers = recommendReviewers(diffSummary.changedFiles);

      return {
        content: [
          {
            type: "text",
            text: `PR #${prInfo.number}: ${fullPrInfo.title}\n${diffSummary.totalFiles} files changed (+${diffSummary.additions}/-${diffSummary.deletions})`,
          },
        ],
        details: {
          pr_info: {
            ...prInfo,
            title: fullPrInfo.title,
          },
          diff_summary: {
            total_files: diffSummary.totalFiles,
            additions: diffSummary.additions,
            deletions: diffSummary.deletions,
          },
          diff_text: diffText,
          worktree,
          recommended_reviewers: recommendedReviewers,
          files: diffSummary.changedFiles,
        },
      };
    },
  });

  // Helper to register专项 tools
  function registerReviewerTool(
    name: string,
    label: string,
    description: string,
    reviewerFn: (files: ChangedFile[]) => import("./types").ReviewResult
  ): void {
    pi.registerTool({
      name,
      label,
      description,
      parameters: Type.Object({
        diff_text: Type.String(),
        files: Type.Array(
          Type.Object({
            path: Type.String(),
            status: Type.String(),
            additions: Type.Number(),
            deletions: Type.Number(),
            hunks: Type.Array(
              Type.Object({
                oldStart: Type.Number(),
                oldCount: Type.Number(),
                newStart: Type.Number(),
                newCount: Type.Number(),
                lines: Type.Array(Type.String()),
              })
            ),
          })
        ),
        worktree_path: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const files = params.files as ChangedFile[];
        const result = reviewerFn(files);
        return {
          content: [
            { type: "text", text: formatReviewResult(result, label) },
          ],
          details: {
            findings: result.findings,
            summary: result.summary,
            notes: result.notes,
          },
        };
      },
    });
  }

  registerReviewerTool(
    "review_tests",
    "Review Tests",
    "Analyze test coverage for the PR changes",
    reviewTests
  );
  registerReviewerTool(
    "review_error_handling",
    "Review Error Handling",
    "Hunt silent failures and bare catches",
    reviewErrors
  );
  registerReviewerTool(
    "review_type_design",
    "Review Type Design",
    "Analyze type/interface changes",
    reviewTypes
  );
  registerReviewerTool(
    "review_comments",
    "Review Comments",
    "Extract and analyze new/modified comments",
    reviewComments
  );
  registerReviewerTool(
    "review_code_quality",
    "Review Code Quality",
    "General code quality rules",
    reviewQuality
  );
  registerReviewerTool(
    "review_simplification",
    "Review Simplification",
    "Flag over-complex code",
    reviewSimplification
  );

  pi.registerTool({
    name: "save_review",
    label: "Save Review",
    description: "Persist a completed PR review report to .pr-reviews/ as markdown",
    parameters: Type.Object({
      pr_info: Type.Object({
        number: Type.Number(),
        repo: Type.String(),
        title: Type.String(),
      }),
      findings: Type.Array(
        Type.Object({
          type: Type.String(),
          file: Type.String(),
          line: Type.Optional(Type.Number()),
          severity: Type.String(),
          description: Type.String(),
        })
      ),
      summary: Type.String(),
      recommendations: Type.Array(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const date = new Date().toISOString().split("T")[0];
      const reviewDir = join(ctx.cwd, ".pr-reviews");
      mkdirSync(reviewDir, { recursive: true });

      const filename = `${date}-pr-${params.pr_info.number}-${params.pr_info.repo}-review.md`;
      const filepath = join(reviewDir, filename);

      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const sortedFindings = [...params.findings].sort(
        (a, b) => severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder]
      );

      const md = [
        `# PR Review: #${params.pr_info.number} - ${params.pr_info.title}`,
        "",
        `**Repo:** ${params.pr_info.repo}  `,
        `**Date:** ${date}  `,
        "",
        "## Overall Assessment",
        "",
        params.summary,
        "",
        "## Findings",
        "",
        ...sortedFindings.map((f) => {
          const icon = f.severity === "critical" ? "✗" : f.severity === "warning" ? "⚠" : "ℹ";
          const loc = f.line ? `${f.file}:${f.line}` : f.file;
          return `- ${icon} **${f.severity}** \`${loc}\` — ${f.description}`;
        }),
        "",
        "## Recommended Actions",
        "",
        ...params.recommendations.map((r, i) => `${i + 1}. ${r}`),
        "",
      ].join("\n");

      writeFileSync(filepath, md, "utf-8");

      return {
        content: [{ type: "text", text: `Review saved to ${filepath}` }],
        details: { filepath },
      };
    },
  });

  // ── Commands ──

  pi.registerCommand("review-pr", {
    description: "Review a GitHub PR: /review-pr <url>",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /review-pr <url>", "warn");
        return;
      }
      ctx.ui.notify(`Starting review for ${args}...`, "info");
      // The user can then call review_pr tool via natural language
    },
  });

  pi.registerCommand("review-pr-cleanup", {
    description: "Remove review worktrees: /review-pr-cleanup [pr_number]",
    handler: async (args, ctx) => {
      if (args) {
        const num = parseInt(args, 10);
        const path = activeWorktrees.get(num);
        if (path) {
          try {
            removeWorktree(ctx.cwd, path);
            activeWorktrees.delete(num);
            ctx.ui.notify(`Removed worktree for PR #${num}`, "info");
          } catch (err) {
            ctx.ui.notify(`Failed to remove worktree: ${(err as Error).message}`, "error");
          }
        } else {
          ctx.ui.notify(`No worktree found for PR #${num}`, "warn");
        }
      } else {
        // Clean up all
        for (const [num, path] of activeWorktrees) {
          try {
            removeWorktree(ctx.cwd, path);
          } catch {
            // Best effort
          }
        }
        activeWorktrees.clear();
        ctx.ui.notify("All review worktrees removed", "info");
      }
    },
  });

  // ── Cleanup on shutdown ──

  pi.on("session_shutdown", () => {
    if (!config.worktree.cleanupOnSessionEnd) return;
    for (const [num, path] of activeWorktrees) {
      try {
        removeWorktree(process.cwd(), path);
      } catch {
        // Best effort
      }
    }
    activeWorktrees.clear();
  });
}
