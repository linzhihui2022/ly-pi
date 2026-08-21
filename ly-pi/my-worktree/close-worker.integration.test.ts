import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runPostExitWorktreeClosure } from "./close-worker";
import { createPostExitWorktreeClosureDeps } from "./close-worker-runtime";
import type { WorktreeClosePlan } from "./closure";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function createFixture(): { repositoryRoot: string; worktreePath: string } {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "close-worktree-"));
  const worktreePath = join(repositoryRoot, ".worktree", "feature");
  execFileSync("git", ["init", "-b", "main", repositoryRoot]);
  writeFileSync(join(repositoryRoot, "README.md"), "fixture\n");
  writeFileSync(join(repositoryRoot, ".gitignore"), "ignored.txt\n");
  git(repositoryRoot, ["add", "README.md", ".gitignore"]);
  execFileSync("git", [
    "-C",
    repositoryRoot,
    "-c",
    "user.name=Test User",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    "initial",
  ]);
  execFileSync("git", [
    "-C",
    repositoryRoot,
    "worktree",
    "add",
    "-b",
    "feature",
    worktreePath,
  ]);
  return {
    repositoryRoot: realpathSync(repositoryRoot),
    worktreePath: realpathSync(worktreePath),
  };
}

function createPlan(
  repositoryRoot: string,
  worktreePath: string,
): WorktreeClosePlan {
  return Object.freeze({
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
}

async function executeFixtureCommand(argv: readonly string[]) {
  const [command, ...args] = argv;
  try {
    return {
      code: 0,
      output: execFileSync(command, args, { encoding: "utf8" }),
    };
  } catch (error) {
    const result = error as { status?: number | null; stderr?: string };
    return {
      code: result.status ?? 1,
      output: result.stderr ?? "",
    };
  }
}

function createRuntime(waitForPidExit: (pid: number) => Promise<boolean>) {
  return createPostExitWorktreeClosureDeps({
    exec: executeFixtureCommand,
    waitForPidExit: async (pid) => waitForPidExit(pid),
    exists: existsSync,
    platform: "darwin",
    isExecutable: () => true,
  });
}

// Temporary Git fixture setup can exceed Vitest's 5-second default under coverage.
describe("post-exit worktree closure integration", () => {
  it("removes a linked worktree with ignored files without force, retains its branch, then runs the hook", async () => {
    const { repositoryRoot, worktreePath } = createFixture();
    const plan = createPlan(repositoryRoot, worktreePath);
    const ignoredFile = join(worktreePath, "ignored.txt");
    writeFileSync(ignoredFile, "ignored\n");
    const hook = vi.fn(async () => {
      expect(existsSync(worktreePath)).toBe(false);
      return { code: 0, output: "" };
    });
    const reports: string[] = [];

    try {
      const runtime = createRuntime(async () => true);

      await expect(
        runPostExitWorktreeClosure(
          { piPid: 123, plan },
          {
            ...runtime,
            runHook: hook,
            report: (message) => reports.push(message),
          },
        ),
      ).resolves.toBe("completed");

      expect(existsSync(worktreePath)).toBe(false);
      expect(existsSync(ignoredFile)).toBe(false);
      expect(
        git(repositoryRoot, [
          "show-ref",
          "--verify",
          "--quiet",
          "refs/heads/feature",
        ]),
      ).toBe("");
      expect(hook).toHaveBeenCalledWith(["/bin/true", "pane-150"]);
      expect(reports).toEqual([]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("leaves the fixture and its hook untouched when Pi exit times out", async () => {
    const { repositoryRoot, worktreePath } = createFixture();
    const plan = createPlan(repositoryRoot, worktreePath);
    const hook = vi.fn(async () => ({ code: 0, output: "" }));
    const reports: string[] = [];

    try {
      await expect(
        runPostExitWorktreeClosure(
          { piPid: 123, plan },
          {
            ...createRuntime(async () => false),
            runHook: hook,
            report: (message) => reports.push(message),
          },
        ),
      ).resolves.toBe("timed-out");

      expect(existsSync(worktreePath)).toBe(true);
      expect(hook).not.toHaveBeenCalled();
      expect(reports).toEqual([
        `close-worktree: Pi did not exit within 30 seconds. Worktree left at ${worktreePath}. Recover with: cd '${repositoryRoot}'`,
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("retains the fixture and skips the hook when normal Git removal fails", async () => {
    const { repositoryRoot, worktreePath } = createFixture();
    const plan = createPlan(repositoryRoot, worktreePath);
    const hook = vi.fn(async () => ({ code: 0, output: "" }));
    const reports: string[] = [];

    try {
      await expect(
        runPostExitWorktreeClosure(
          { piPid: 123, plan },
          {
            ...createRuntime(async () => true),
            removeWorktree: async () => ({
              code: 23,
              output: "fake Git removal failure",
            }),
            runHook: hook,
            report: (message) => reports.push(message),
          },
        ),
      ).resolves.toBe("removal-failed");

      expect(existsSync(worktreePath)).toBe(true);
      expect(hook).not.toHaveBeenCalled();
      expect(reports).toEqual([
        `close-worktree: worktree removal failed (exit 23): fake Git removal failure. Worktree left at ${worktreePath}. Recover with: cd '${repositoryRoot}'`,
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("retains the terminal with recovery guidance when the post-removal hook fails", async () => {
    const { repositoryRoot, worktreePath } = createFixture();
    const plan = createPlan(repositoryRoot, worktreePath);
    const reports: string[] = [];

    try {
      await expect(
        runPostExitWorktreeClosure(
          { piPid: 123, plan },
          {
            ...createRuntime(async () => true),
            runHook: async () => ({ code: 7, output: "fake hook failure" }),
            report: (message) => reports.push(message),
          },
        ),
      ).resolves.toBe("hook-failed");

      expect(existsSync(worktreePath)).toBe(false);
      expect(
        git(repositoryRoot, [
          "show-ref",
          "--verify",
          "--quiet",
          "refs/heads/feature",
        ]),
      ).toBe("");
      expect(reports).toEqual([
        `close-worktree: worktree was removed, but terminal hook failed (exit 7): ["/bin/true","pane-150"]. Recover with: cd '${repositoryRoot}'`,
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("retains a dirty worktree and skips the hook after revalidation", async () => {
    const { repositoryRoot, worktreePath } = createFixture();
    const plan = createPlan(repositoryRoot, worktreePath);
    const hook = vi.fn(async () => ({ code: 0, output: "" }));
    const reports: string[] = [];
    writeFileSync(join(worktreePath, "README.md"), "dirty\n");

    try {
      await expect(
        runPostExitWorktreeClosure(
          { piPid: 123, plan },
          {
            ...createRuntime(async () => true),
            runHook: hook,
            report: (message) => reports.push(message),
          },
        ),
      ).resolves.toBe("revalidation-failed");

      expect(existsSync(worktreePath)).toBe(true);
      expect(hook).not.toHaveBeenCalled();
      expect(reports).toEqual([
        `close-worktree: revalidation failed: The current worktree has tracked changes. Worktree left at ${worktreePath}. Recover with: cd '${repositoryRoot}'`,
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
}, 15_000);
