import { describe, expect, it, vi } from "vitest";
import type { PostExitWorktreeClosureRequest } from "./close-worker";
import { runCloseWorktreeWorker } from "./close-worker-main";
import type { WorktreeClosureFacts } from "./closure";

const request: PostExitWorktreeClosureRequest = {
  piPid: 123,
  plan: {
    repositoryRoot: "/repo",
    worktreePath: "/repo/.worktree/feature",
    branch: "feature",
    expectedSafetyState: {
      isCurrent: true,
      isLinked: true,
      isPrimary: false,
      isLocked: false,
      isPrunable: false,
      gitOperation: null,
      hasTrackedChanges: false,
      untrackedFiles: "none",
      hasInitializedSubmodules: false,
    },
    hookArgv: ["wezterm", "cli", "kill-pane", "--pane-id", "150"],
  },
};

function readyFacts(): WorktreeClosureFacts {
  return {
    platform: "darwin",
    worktree: {
      path: request.plan.worktreePath,
      repositoryRoot: request.plan.repositoryRoot,
      branch: request.plan.branch,
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

describe("runCloseWorktreeWorker", () => {
  it("rejects malformed serialized input before changing directory or running Git", async () => {
    const chdir = vi.fn();
    const report = vi.fn();
    const createDeps = vi.fn();

    await expect(
      runCloseWorktreeWorker(["not-json"], { chdir, report, createDeps }),
    ).resolves.toBe(1);
    await expect(
      runCloseWorktreeWorker([], { chdir, report, createDeps }),
    ).resolves.toBe(1);

    expect(chdir).not.toHaveBeenCalled();
    expect(createDeps).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(
      "close-worktree worker: invalid close plan input.",
    );
  });

  it("rejects structurally unsafe serialized plans before changing directory", async () => {
    const invalidRequests = [
      { ...request, unexpected: true },
      { ...request, piPid: 0 },
      {
        ...request,
        plan: { ...request.plan, worktreePath: request.plan.repositoryRoot },
      },
      {
        ...request,
        plan: { ...request.plan, hookArgv: ["wezterm"] },
      },
      {
        ...request,
        plan: {
          ...request.plan,
          expectedSafetyState: {
            ...request.plan.expectedSafetyState,
            isLocked: true,
          },
        },
      },
      {
        ...request,
        plan: {
          ...request.plan,
          hookArgv: ["wezterm", '"quoted', "150"],
        },
      },
    ];

    for (const invalidRequest of invalidRequests) {
      const chdir = vi.fn();
      const report = vi.fn();
      const createDeps = vi.fn();

      await expect(
        runCloseWorktreeWorker([JSON.stringify(invalidRequest)], {
          chdir,
          report,
          createDeps,
        }),
      ).resolves.toBe(1);

      expect(chdir).not.toHaveBeenCalled();
      expect(createDeps).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(
        "close-worktree worker: invalid close plan input.",
      );
    }
  });

  it("runs the decoded close plan from its repository root", async () => {
    const chdir = vi.fn();
    const report = vi.fn();
    const waitForPidExit = vi.fn(async () => false);
    const createDeps = vi.fn(() => ({
      waitForPidExit,
      inspectWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      runHook: vi.fn(),
      report,
    }));

    await expect(
      runCloseWorktreeWorker([JSON.stringify(request)], {
        chdir,
        report,
        createDeps,
      }),
    ).resolves.toBe(1);

    expect(chdir).toHaveBeenCalledWith("/repo");
    expect(createDeps).toHaveBeenCalledOnce();
    expect(waitForPidExit).toHaveBeenCalledWith(123, 30_000);
  });

  it("freezes a valid decoded plan before the worker uses it", async () => {
    const chdir = vi.fn();
    const report = vi.fn();
    let inspectedPlan: PostExitWorktreeClosureRequest["plan"] | undefined;

    await expect(
      runCloseWorktreeWorker([JSON.stringify(request)], {
        chdir,
        report,
        createDeps: () => ({
          waitForPidExit: async () => true,
          inspectWorktree: async (plan) => {
            inspectedPlan = plan;
            return readyFacts();
          },
          removeWorktree: async () => ({ code: 0, output: "" }),
          runHook: async () => ({ code: 0, output: "" }),
          report,
        }),
      }),
    ).resolves.toBe(0);

    expect(Object.isFrozen(inspectedPlan)).toBe(true);
    expect(Object.isFrozen(inspectedPlan?.expectedSafetyState)).toBe(true);
    expect(Object.isFrozen(inspectedPlan?.hookArgv)).toBe(true);
  });

  it("preserves literal quotes in the final terminal target", async () => {
    const hookArgv = [...request.plan.hookArgv.slice(0, -1), 'pane "150"'];
    const runHook = vi.fn(async () => ({ code: 0, output: "" }));

    await expect(
      runCloseWorktreeWorker(
        [
          JSON.stringify({
            ...request,
            plan: { ...request.plan, hookArgv },
          }),
        ],
        {
          chdir: vi.fn(),
          report: vi.fn(),
          createDeps: () => ({
            waitForPidExit: async () => true,
            inspectWorktree: async () => readyFacts(),
            removeWorktree: async () => ({ code: 0, output: "" }),
            runHook,
            report: vi.fn(),
          }),
        },
      ),
    ).resolves.toBe(0);

    expect(runHook).toHaveBeenCalledWith(hookArgv);
  });

  it("reports a repository-root change-directory failure without running the worker", async () => {
    const report = vi.fn();
    const createDeps = vi.fn();

    await expect(
      runCloseWorktreeWorker([JSON.stringify(request)], {
        chdir: () => {
          throw new Error("directory is gone");
        },
        report,
        createDeps,
      }),
    ).resolves.toBe(1);

    expect(createDeps).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      "close-worktree worker: cannot enter repository root: directory is gone",
    );
  });

  it("signals readiness only after changing to the repository root and starting PID wait", async () => {
    const calls: string[] = [];
    const report = vi.fn();

    await expect(
      runCloseWorktreeWorker(
        [JSON.stringify(request)],
        {
          chdir: () => {
            calls.push("chdir");
          },
          report,
          createDeps: () => ({
            waitForPidExit: async (_pid, _timeout, onWaiting) => {
              calls.push("wait");
              onWaiting?.();
              return false;
            },
            inspectWorktree: vi.fn(),
            removeWorktree: vi.fn(),
            runHook: vi.fn(),
            report,
          }),
        },
        () => {
          calls.push("ready");
        },
      ),
    ).resolves.toBe(1);

    expect(calls).toEqual(["chdir", "wait", "ready"]);
  });
});
