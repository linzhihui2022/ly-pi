import { describe, expect, it, vi } from "vitest";
import {
  runPostExitWorktreeClosure,
  type WorkerCommandResult,
} from "./close-worker";
import { createPostExitWorktreeClosureDeps } from "./close-worker-runtime";
import type { WorktreeClosePlan } from "./closure";

const repositoryRoot = "/repo";
const worktreePath = "/repo/.worktree/feature";

const plan: WorktreeClosePlan = Object.freeze({
  repositoryRoot,
  worktreePath,
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
  hookArgv: Object.freeze(["/bin/true", "pane-150"]),
});

const worktreeList = [
  `worktree ${repositoryRoot}`,
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  `worktree ${worktreePath}`,
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/feature",
  "",
].join("\n");

const ok = (output = ""): WorkerCommandResult => ({ code: 0, output });

interface MockRuntimeOptions {
  exited?: boolean;
  dirty?: boolean;
  removal?: WorkerCommandResult;
  hook?: WorkerCommandResult;
}

function createMockRuntime(options: MockRuntimeOptions = {}) {
  let linked = true;
  const removal = options.removal ?? ok();
  const hook = options.hook ?? ok();
  const reports: string[] = [];
  const exec = vi.fn(
    async (argv: readonly string[]): Promise<WorkerCommandResult> => {
      if (argv[0] === "git" && argv.includes("list")) {
        return ok(worktreeList);
      }
      if (argv[0] === "git" && argv.includes("status")) {
        return ok(options.dirty ? " M README.md\n" : "");
      }
      if (argv[0] === "git" && argv.includes("submodule")) return ok();
      if (argv[0] === "git" && argv.includes("rev-parse")) {
        return ok(`/git/${argv.at(-1)}\n`);
      }
      if (argv[0] === "git" && argv.includes("remove")) {
        if (removal.code === 0) linked = false;
        return removal;
      }
      if (argv[0] === "/bin/true") return hook;

      throw new Error(`unexpected command: ${argv.join(" ")}`);
    },
  );
  const deps = createPostExitWorktreeClosureDeps({
    exec,
    waitForPidExit: async () => options.exited ?? true,
    exists: () => false,
    platform: "darwin",
    isExecutable: () => true,
    report: (message) => reports.push(message),
  });

  return {
    deps,
    exec,
    reports,
    get linked() {
      return linked;
    },
  };
}

describe("post-exit worktree closure runtime adapter", () => {
  it("removes a clean linked worktree through mocked Git, then runs the hook", async () => {
    const runtime = createMockRuntime();

    await expect(
      runPostExitWorktreeClosure({ piPid: 123, plan }, runtime.deps),
    ).resolves.toBe("completed");

    expect(runtime.linked).toBe(false);
    expect(runtime.exec).toHaveBeenCalledWith([
      "git",
      "-C",
      repositoryRoot,
      "worktree",
      "remove",
      worktreePath,
    ]);
    expect(runtime.exec).toHaveBeenCalledWith(["/bin/true", "pane-150"]);
    expect(runtime.reports).toEqual([]);
  });

  it("leaves the mocked worktree and hook untouched when Pi exit times out", async () => {
    const runtime = createMockRuntime({ exited: false });

    await expect(
      runPostExitWorktreeClosure({ piPid: 123, plan }, runtime.deps),
    ).resolves.toBe("timed-out");

    expect(runtime.linked).toBe(true);
    expect(runtime.exec).not.toHaveBeenCalled();
    expect(runtime.reports).toEqual([
      "close-worktree: Pi did not exit within 30 seconds. Worktree left at /repo/.worktree/feature. Recover with: cd '/repo'",
    ]);
  });

  it("leaves the mocked worktree and skips the hook when Git removal fails", async () => {
    const runtime = createMockRuntime({
      removal: { code: 23, output: "fake Git removal failure" },
    });

    await expect(
      runPostExitWorktreeClosure({ piPid: 123, plan }, runtime.deps),
    ).resolves.toBe("removal-failed");

    expect(runtime.linked).toBe(true);
    expect(runtime.exec).not.toHaveBeenCalledWith(["/bin/true", "pane-150"]);
    expect(runtime.reports).toEqual([
      "close-worktree: worktree removal failed (exit 23): fake Git removal failure. Worktree left at /repo/.worktree/feature. Recover with: cd '/repo'",
    ]);
  });

  it("reports hook failure after mocked Git removes the worktree", async () => {
    const runtime = createMockRuntime({
      hook: { code: 7, output: "fake hook failure" },
    });

    await expect(
      runPostExitWorktreeClosure({ piPid: 123, plan }, runtime.deps),
    ).resolves.toBe("hook-failed");

    expect(runtime.linked).toBe(false);
    expect(runtime.reports).toEqual([
      'close-worktree: worktree was removed, but terminal hook failed (exit 7): ["/bin/true","pane-150"]. Recover with: cd \'/repo\'',
    ]);
  });

  it("retains a dirty mocked worktree and skips its hook after revalidation", async () => {
    const runtime = createMockRuntime({ dirty: true });

    await expect(
      runPostExitWorktreeClosure({ piPid: 123, plan }, runtime.deps),
    ).resolves.toBe("revalidation-failed");

    expect(runtime.linked).toBe(true);
    expect(runtime.exec).not.toHaveBeenCalledWith([
      "git",
      "-C",
      repositoryRoot,
      "worktree",
      "remove",
      worktreePath,
    ]);
    expect(runtime.exec).not.toHaveBeenCalledWith(["/bin/true", "pane-150"]);
    expect(runtime.reports).toEqual([
      "close-worktree: revalidation failed: The current worktree has tracked changes. Worktree left at /repo/.worktree/feature. Recover with: cd '/repo'",
    ]);
  });
});
