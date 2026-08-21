import { describe, expect, it, vi } from "vitest";
import type { WorkerCommandResult } from "./close-worker";
import {
  createPostExitWorktreeClosureDeps,
  createSystemPostExitWorktreeClosureDeps,
  executeWorkerCommand,
  inspectWorktreeClosure,
  isWorkerExecutable,
  waitForProcessExit,
} from "./close-worker-runtime";
import type { WorktreeClosePlan } from "./closure";

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

const ok = (output = ""): WorkerCommandResult => ({ code: 0, output });

describe("inspectWorktreeClosure", () => {
  it("revalidates a clean linked worktree from outside its target directory", async () => {
    const exec = vi.fn(async (argv: readonly string[]) => {
      if (argv.includes("worktree")) {
        return ok(
          [
            "worktree /repo",
            "HEAD 1111111111111111111111111111111111111111",
            "branch refs/heads/main",
            "",
            "worktree /repo/.worktree/feature",
            "HEAD 2222222222222222222222222222222222222222",
            "branch refs/heads/feature",
            "",
          ].join("\n"),
        );
      }
      if (argv.includes("status")) return ok();
      if (argv.includes("submodule")) return ok();
      if (argv.includes("rev-parse")) return ok(`/git/${argv.at(-1)}\n`);
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    });

    await expect(
      inspectWorktreeClosure(plan, {
        exec,
        exists: () => false,
        platform: "darwin",
        isExecutable: (command) => command === "wezterm",
      }),
    ).resolves.toEqual({
      platform: "darwin",
      worktree: {
        path: "/repo/.worktree/feature",
        repositoryRoot: "/repo",
        branch: "feature",
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
    });

    expect(exec.mock.calls).toEqual(
      expect.arrayContaining([
        [["git", "-C", "/repo", "worktree", "list", "--porcelain"]],
        [
          [
            "git",
            "-C",
            "/repo/.worktree/feature",
            "status",
            "--porcelain",
            "--untracked-files=all",
          ],
        ],
      ]),
    );
  });

  it("recognizes executable paths without invoking them", () => {
    expect(isWorkerExecutable(process.execPath)).toBe(true);
    expect(isWorkerExecutable("git")).toBe(true);
    expect(isWorkerExecutable("")).toBe(false);
    expect(
      isWorkerExecutable("/definitely-not-a-real-close-worktree-command"),
    ).toBe(false);
  });

  it("waits no longer than the configured timeout for Pi to exit", async () => {
    let now = 0;
    const sleeps: number[] = [];

    await expect(
      waitForProcessExit(123, 30_000, {
        isPidAlive: () => true,
        now: () => now,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
        },
      }),
    ).resolves.toBe(false);

    expect(now).toBe(30_000);
    expect(sleeps).toHaveLength(30);
  });

  it("returns command output and actionable startup failures without a shell", async () => {
    await expect(
      executeWorkerCommand(["/bin/echo", "worker output"]),
    ).resolves.toEqual({
      code: 0,
      output: "worker output\n",
    });
    await expect(
      executeWorkerCommand(["/bin/sh", "-c", "printf stderr >&2; exit 3"]),
    ).resolves.toEqual({ code: 3, output: "stderr" });
    await expect(
      executeWorkerCommand(["definitely-not-a-real-command-close-worktree"]),
    ).resolves.toMatchObject({ code: 127 });
  });

  it("reports every unsafe state found during post-exit inspection", async () => {
    const exec = vi.fn(async (argv: readonly string[]) => {
      if (argv.includes("worktree")) {
        return ok(
          [
            "worktree /repo",
            "HEAD 1111111111111111111111111111111111111111",
            "branch refs/heads/main",
            "",
            "worktree /repo/.worktree/feature",
            "HEAD 2222222222222222222222222222222222222222",
            "branch refs/heads/feature",
            "locked retained for test",
            "",
          ].join("\n"),
        );
      }
      if (argv.includes("status")) return ok("?? scratch.txt\n");
      if (argv.includes("submodule")) return ok(" deadbeef submodule\n");
      if (argv.includes("rev-parse")) return ok(`/git/${argv.at(-1)}\n`);
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    });

    await expect(
      inspectWorktreeClosure(plan, {
        exec,
        exists: (path) => path === "/git/MERGE_HEAD",
        platform: "darwin",
        isExecutable: () => false,
      }),
    ).resolves.toMatchObject({
      worktree: { isLocked: true },
      gitOperation: "merge",
      hasTrackedChanges: false,
      untrackedFiles: "non-ignored",
      hasInitializedSubmodules: true,
      closeHook: { executableAvailable: false },
    });
  });

  it("returns unlinked facts without inspecting a missing target worktree", async () => {
    const exec = vi.fn(async () =>
      ok(
        [
          "worktree /repo",
          "HEAD 1111111111111111111111111111111111111111",
          "branch refs/heads/main",
          "",
        ].join("\n"),
      ),
    );

    await expect(
      inspectWorktreeClosure(plan, {
        exec,
        exists: () => false,
        platform: "darwin",
        isExecutable: () => true,
      }),
    ).resolves.toMatchObject({
      worktree: { isCurrent: false, isLinked: false, branch: null },
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("rejects an inspection command failure instead of treating it as clean", async () => {
    await expect(
      inspectWorktreeClosure(plan, {
        exec: async () => ({ code: 42, output: "git unavailable" }),
        exists: () => false,
        platform: "darwin",
        isExecutable: () => true,
      }),
    ).rejects.toThrow(
      "git -C /repo worktree list --porcelain failed (exit 42)",
    );
  });

  it("returns immediately when the observed Pi process has already exited", async () => {
    const sleep = vi.fn(async () => undefined);

    await expect(
      waitForProcessExit(123, 30_000, {
        isPidAlive: () => false,
        now: () => 0,
        sleep,
      }),
    ).resolves.toBe(true);

    expect(sleep).not.toHaveBeenCalled();
  });

  it("uses the remaining time rather than exceeding a short wait deadline", async () => {
    let now = 0;
    const sleeps: number[] = [];

    await expect(
      waitForProcessExit(123, 50, {
        isPidAlive: () => true,
        now: () => now,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
        },
      }),
    ).resolves.toBe(false);

    expect(sleeps).toEqual([50]);
  });

  it("uses normal Git removal and direct hook argv in the runtime adapter", async () => {
    const exec = vi.fn(async () => ok());
    const deps = createPostExitWorktreeClosureDeps({
      exec,
      waitForPidExit: async () => true,
      platform: "darwin",
      exists: () => false,
      isExecutable: () => true,
    });

    await expect(
      deps.removeWorktree(plan.repositoryRoot, plan.worktreePath),
    ).resolves.toEqual(ok());
    await expect(deps.runHook(plan.hookArgv)).resolves.toEqual(ok());

    expect(exec).toHaveBeenNthCalledWith(1, [
      "git",
      "-C",
      "/repo",
      "worktree",
      "remove",
      "/repo/.worktree/feature",
    ]);
    expect(exec).toHaveBeenNthCalledWith(2, [
      "wezterm",
      "cli",
      "kill-pane",
      "--pane-id",
      "150",
    ]);
  });

  it("constructs system dependencies that conservatively observe a live PID", async () => {
    const deps = createSystemPostExitWorktreeClosureDeps();

    await expect(deps.waitForPidExit(process.pid, 0)).resolves.toBe(false);
    await expect(deps.runHook([])).resolves.toEqual({
      code: 127,
      output: "missing command",
    });
  });
});
