import { existsSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { startCloseWorktreeWorker } from "./close-worker-launcher";
import {
  executeWorkerCommand,
  inspectCurrentWorktreeClosure,
  isWorkerExecutable,
} from "./close-worker-runtime";
import { assessWorktreeClosure, type WorktreeClosePlan } from "./closure";
import { renderWorktreeLines } from "./render";
import { getVisibleWorktrees, type WorktreeSnapshot } from "./worktrees";

const WIDGET_KEY = "my-worktree";

function closeWorktreeSummary(plan: WorktreeClosePlan): string {
  const branch = plan.branch ?? "(none; detached HEAD)";

  return [
    `Worktree to remove: ${plan.worktreePath}`,
    `Local branch retained: ${branch}`,
    "",
    "Ignored files in this worktree may be deleted.",
    "No external-process scan was performed.",
    "",
    "Pi will exit gracefully. The worktree will be removed only if post-exit revalidation passes. The configured terminal hook will run only after successful removal.",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function myWorktree(pi: ExtensionAPI): void {
  pi.registerCommand("close-worktree", {
    description: "Gracefully close the current Git worktree",
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("/close-worktree does not accept arguments.", "error");
        return;
      }

      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify(
          "/close-worktree is available only in an interactive Pi TUI session.",
          "error",
        );
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "/close-worktree is available only while Pi is idle.",
          "error",
        );
        return;
      }

      let assessment: ReturnType<typeof assessWorktreeClosure>;
      try {
        assessment = assessWorktreeClosure(
          await inspectCurrentWorktreeClosure(ctx.cwd, {
            exec: executeWorkerCommand,
            exists: existsSync,
            platform: process.platform,
            isExecutable: isWorkerExecutable,
            closeHook: {
              command: process.env.PI_W_CLOSE,
              target: process.env.PI_W_CLOSE_TARGET,
            },
          }),
        );
      } catch (error) {
        ctx.ui.notify(
          `Could not inspect the current worktree: ${errorMessage(error)}. Pi remains running.`,
          "error",
        );
        return;
      }

      if (assessment.status === "refused") {
        ctx.ui.notify(assessment.message, "error");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        "Close current worktree?",
        closeWorktreeSummary(assessment.plan),
      );
      if (!confirmed) return;

      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "/close-worktree is available only while Pi is idle.",
          "error",
        );
        return;
      }

      try {
        await startCloseWorktreeWorker(assessment.plan);
      } catch (error) {
        ctx.ui.notify(
          `Could not start close-worktree worker: ${errorMessage(error)}. Pi remains running.`,
          "error",
        );
        return;
      }

      ctx.shutdown();
    },
  });

  let active = false;
  let activeTui: TUI | undefined;
  let snapshot: WorktreeSnapshot | null = null;
  let refreshVersion = 0;
  let sessionVersion = 0;

  const requestRender = (): void => {
    activeTui?.requestRender();
  };

  const refresh = (ctx: ExtensionContext): void => {
    const version = ++refreshVersion;
    const session = sessionVersion;
    void getVisibleWorktrees(ctx.cwd).then(
      (nextWorktrees) => {
        if (
          !active ||
          session !== sessionVersion ||
          version !== refreshVersion
        ) {
          return;
        }
        snapshot =
          nextWorktrees && nextWorktrees.worktrees.length >= 2
            ? nextWorktrees
            : null;
        requestRender();
      },
      () => {
        if (
          !active ||
          session !== sessionVersion ||
          version !== refreshVersion
        ) {
          return;
        }
        snapshot = null;
        requestRender();
      },
    );
  };

  const render = (theme: Theme, width: number): string[] =>
    snapshot
      ? renderWorktreeLines(
          theme,
          snapshot.worktrees,
          width,
          snapshot.repositoryRoot,
        )
      : [];

  pi.on("session_start", (_event, ctx) => {
    sessionVersion++;
    active = ctx.hasUI;
    snapshot = null;
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        activeTui = tui;
        return {
          render: (width: number) => render(theme, width),
          invalidate: () => {
            activeTui = undefined;
          },
        };
      },
      { placement: "aboveEditor" },
    );
    refresh(ctx);
  });

  pi.on("turn_start", (_event, ctx) => {
    if (active && ctx.hasUI) refresh(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    if (active && ctx.hasUI) refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!active) return;
    sessionVersion++;
    refreshVersion++;
    active = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    activeTui = undefined;
    snapshot = null;
  });
}
