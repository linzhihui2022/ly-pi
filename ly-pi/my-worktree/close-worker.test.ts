import { describe, expect, it } from "vitest";
import { runPostExitWorktreeClosure } from "./close-worker";
import type { WorktreeClosePlan, WorktreeClosureFacts } from "./closure";

const plan: WorktreeClosePlan = Object.freeze({
  repositoryRoot: "/repo",
  worktreePath: "/repo/.worktree/feature",
  branch: "feature",
  expectedSafetyState: Object.freeze({
    isCurrent: true,
    isLinked: true,
    isPrimary: false,
    isLocked: false,
    isPrunable: false,
    gitOperation: null,
    hasTrackedChanges: false,
    untrackedFiles: "none",
    hasInitializedSubmodules: false,
  }),
  hookArgv: Object.freeze(["wezterm", "cli", "kill-pane", "--pane-id", "150"]),
});

function readyFacts(): WorktreeClosureFacts {
  return {
    platform: "darwin",
    worktree: {
      path: plan.worktreePath,
      repositoryRoot: plan.repositoryRoot,
      branch: plan.branch,
      isCurrent: true,
      isLinked: true,
      isPrimary: false,
      isLocked: false,
      isPrunable: false,
    },
    gitOperation: null,
    hasTrackedChanges: false,
    untrackedFiles: "none",
    hasInitializedSubmodules: false,
    closeHook: {
      command: "wezterm cli kill-pane --pane-id",
      target: "150",
      executableAvailable: true,
    },
  };
}

describe("runPostExitWorktreeClosure", () => {
  it("leaves the worktree and terminal untouched when Pi does not exit in time", async () => {
    const reports: string[] = [];
    const timeouts: number[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async (_pid, timeoutMs) => {
            timeouts.push(timeoutMs);
            return false;
          },
          inspectWorktree: async () => {
            throw new Error("should not inspect before Pi exits");
          },
          removeWorktree: async () => {
            throw new Error("should not remove before Pi exits");
          },
          runHook: async () => {
            throw new Error("should not run the hook before Pi exits");
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("timed-out");

    expect(timeouts).toEqual([30_000]);
    expect(reports).toEqual([
      "close-worktree: Pi did not exit within 30 seconds. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("retains the worktree when post-exit revalidation refuses it", async () => {
    const reports: string[] = [];
    const inspectWorktree = async (): Promise<WorktreeClosureFacts> => ({
      ...readyFacts(),
      hasTrackedChanges: true,
    });

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree,
          removeWorktree: async () => {
            throw new Error("should not remove after refused revalidation");
          },
          runHook: async () => {
            throw new Error(
              "should not run the hook after refused revalidation",
            );
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("revalidation-failed");

    expect(reports).toEqual([
      "close-worktree: revalidation failed: The current worktree has tracked changes. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("retains the worktree when its branch no longer matches the close plan", async () => {
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree: async () => ({
            ...readyFacts(),
            worktree: { ...readyFacts().worktree, branch: "other-branch" },
          }),
          removeWorktree: async () => {
            throw new Error("should not remove a mismatched worktree");
          },
          runHook: async () => {
            throw new Error("should not run hook for a mismatched worktree");
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("revalidation-failed");

    expect(reports).toEqual([
      "close-worktree: revalidation failed: The worktree no longer matches the approved close plan. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("retains the worktree when revalidation cannot be inspected", async () => {
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree: async () => {
            throw new Error("git worktree list failed");
          },
          removeWorktree: async () => {
            throw new Error("should not remove after inspection failure");
          },
          runHook: async () => {
            throw new Error("should not run hook after inspection failure");
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("revalidation-failed");

    expect(reports).toEqual([
      "close-worktree: revalidation could not be completed: git worktree list failed. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("retains the terminal and does not invoke the hook when removal fails", async () => {
    const calls: string[] = [];
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => {
            calls.push("wait");
            return true;
          },
          inspectWorktree: async () => {
            calls.push("inspect");
            return readyFacts();
          },
          removeWorktree: async () => {
            calls.push("remove");
            return { code: 23, output: "Git refused removal" };
          },
          runHook: async () => {
            calls.push("hook");
            return { code: 0, output: "" };
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("removal-failed");

    expect(calls).toEqual(["wait", "inspect", "remove"]);
    expect(reports).toEqual([
      "close-worktree: worktree removal failed (exit 23): Git refused removal. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("reports recovery without running the hook when removal throws", async () => {
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree: async () => readyFacts(),
          removeWorktree: async () => {
            throw new Error("spawn failed");
          },
          runHook: async () => {
            throw new Error("should not run after removal throws");
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("removal-failed");

    expect(reports).toEqual([
      "close-worktree: worktree removal could not be completed: spawn failed. Worktree left at /repo/.worktree/feature. Recover with: cd /repo",
    ]);
  });

  it("reports hook argv and recovery after a post-removal hook failure", async () => {
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree: async () => readyFacts(),
          removeWorktree: async () => ({ code: 0, output: "" }),
          runHook: async () => ({ code: 7, output: "hook error" }),
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("hook-failed");

    expect(reports).toEqual([
      'close-worktree: worktree was removed, but terminal hook failed (exit 7): ["wezterm","cli","kill-pane","--pane-id","150"]. Recover with: cd /repo',
    ]);
  });

  it("reports hook argv and recovery when the post-removal hook throws", async () => {
    const reports: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => true,
          inspectWorktree: async () => readyFacts(),
          removeWorktree: async () => ({ code: 0, output: "" }),
          runHook: async () => {
            throw new Error("hook executable disappeared");
          },
          report: (message) => reports.push(message),
        },
      ),
    ).resolves.toBe("hook-failed");

    expect(reports).toEqual([
      'close-worktree: worktree was removed, but terminal hook could not be run: hook executable disappeared. argv: ["wezterm","cli","kill-pane","--pane-id","150"]. Recover with: cd /repo',
    ]);
  });

  it("removes the revalidated worktree before invoking its close hook", async () => {
    const calls: string[] = [];

    await expect(
      runPostExitWorktreeClosure(
        { piPid: 123, plan },
        {
          waitForPidExit: async () => {
            calls.push("wait");
            return true;
          },
          inspectWorktree: async () => {
            calls.push("inspect");
            return readyFacts();
          },
          removeWorktree: async (repositoryRoot, worktreePath) => {
            calls.push(`remove ${repositoryRoot} ${worktreePath}`);
            return { code: 0, output: "" };
          },
          runHook: async (argv) => {
            calls.push(`hook ${argv.join(" ")}`);
            return { code: 0, output: "" };
          },
          report: () => undefined,
        },
      ),
    ).resolves.toBe("completed");

    expect(calls).toEqual([
      "wait",
      "inspect",
      "remove /repo /repo/.worktree/feature",
      "hook wezterm cli kill-pane --pane-id 150",
    ]);
  });
});
