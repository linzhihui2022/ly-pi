import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import type {
  PostExitWorktreeClosureDeps,
  WorkerCommandResult,
} from "./close-worker";
import type { WorktreeClosePlan, WorktreeClosureFacts } from "./closure";
import { parseWorktreeList } from "./worktrees";

export type WorkerExec = (
  argv: readonly string[],
) => Promise<WorkerCommandResult>;

export interface ClosureInspectionDeps {
  exec: WorkerExec;
  exists(path: string): boolean;
  platform: string;
  isExecutable(command: string): boolean;
}

export interface CloseWorkerRuntimeOptions extends ClosureInspectionDeps {
  waitForPidExit(pid: number, timeoutMs: number): Promise<boolean>;
  report?(message: string): void;
}

const GIT_OPERATIONS = [
  ["MERGE_HEAD", "merge"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["REBASE_HEAD", "rebase"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["BISECT_LOG", "bisect"],
  ["sequencer", "sequencer operation"],
  ["AM_HEAD", "apply-mailbox operation"],
] as const;

const PID_POLL_INTERVAL_MS = 1_000;

export interface ProcessExitWaitDeps {
  isPidAlive(pid: number): boolean;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
  deps: ProcessExitWaitDeps,
): Promise<boolean> {
  const deadline = deps.now() + timeoutMs;
  while (deps.isPidAlive(pid)) {
    const remaining = deadline - deps.now();
    if (remaining <= 0) return false;
    await deps.sleep(Math.min(PID_POLL_INTERVAL_MS, remaining));
  }
  return true;
}

function canExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isWorkerExecutable(command: string): boolean {
  if (!command) return false;
  if (command.includes("/")) return canExecute(command);

  return (process.env.PATH ?? "")
    .split(delimiter)
    .some(
      (directory) => directory !== "" && canExecute(join(directory, command)),
    );
}

export async function executeWorkerCommand(
  argv: readonly string[],
): Promise<WorkerCommandResult> {
  const [command, ...args] = argv;
  if (!command) return { code: 127, output: "missing command" };

  return new Promise((resolveResult) => {
    let output = "";
    let settled = false;
    const settle = (result: WorkerCommandResult): void => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    try {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("error", (error) => {
        settle({ code: 127, output: `${output}${error.message}` });
      });
      child.on("close", (code) => {
        settle({ code: code ?? 1, output });
      });
    } catch (error) {
      settle({
        code: 127,
        output: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function pathsMatch(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

async function commandOrThrow(
  exec: WorkerExec,
  argv: readonly string[],
): Promise<WorkerCommandResult> {
  const result = await exec(argv);
  if (result.code !== 0) {
    throw new Error(
      `${argv.join(" ")} failed (exit ${result.code}): ${result.output.trim() || "no command output"}`,
    );
  }
  return result;
}

async function findGitOperation(
  worktreePath: string,
  deps: Pick<ClosureInspectionDeps, "exec" | "exists">,
): Promise<string | null> {
  for (const [marker, operation] of GIT_OPERATIONS) {
    const markerPath = await commandOrThrow(deps.exec, [
      "git",
      "-C",
      worktreePath,
      "rev-parse",
      "--git-path",
      marker,
    ]);
    if (deps.exists(markerPath.output.trim())) return operation;
  }
  return null;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  });
}

export function createSystemPostExitWorktreeClosureDeps(): PostExitWorktreeClosureDeps {
  return createPostExitWorktreeClosureDeps({
    exec: executeWorkerCommand,
    waitForPidExit: (pid, timeoutMs) =>
      waitForProcessExit(pid, timeoutMs, {
        isPidAlive,
        now: Date.now,
        sleep,
      }),
    exists: existsSync,
    platform: process.platform,
    isExecutable: isWorkerExecutable,
  });
}

export function createPostExitWorktreeClosureDeps(
  options: CloseWorkerRuntimeOptions,
): PostExitWorktreeClosureDeps {
  return {
    waitForPidExit: options.waitForPidExit,
    inspectWorktree: (plan) => inspectWorktreeClosure(plan, options),
    removeWorktree: (repositoryRoot, worktreePath) =>
      options.exec([
        "git",
        "-C",
        repositoryRoot,
        "worktree",
        "remove",
        worktreePath,
      ]),
    runHook: (argv) => options.exec(argv),
    report: options.report ?? console.error,
  };
}

export async function inspectWorktreeClosure(
  plan: WorktreeClosePlan,
  deps: ClosureInspectionDeps,
): Promise<WorktreeClosureFacts> {
  const listed = await commandOrThrow(deps.exec, [
    "git",
    "-C",
    plan.repositoryRoot,
    "worktree",
    "list",
    "--porcelain",
  ]);
  const worktrees = parseWorktreeList(listed.output);
  const primary = worktrees[0];
  const target = worktrees.find((worktree) =>
    pathsMatch(worktree.path, plan.worktreePath),
  );
  const hookArgv = plan.hookArgv;
  const hookTarget = hookArgv.at(-1);
  const hookCommand = hookArgv.slice(0, -1).join(" ");

  if (!target) {
    return {
      platform: deps.platform,
      worktree: {
        path: plan.worktreePath,
        repositoryRoot: primary?.path ?? plan.repositoryRoot,
        branch: null,
        isCurrent: false,
        isLinked: false,
        isPrimary: false,
        isLocked: false,
        isPrunable: false,
      },
      gitOperation: null,
      hasTrackedChanges: false,
      untrackedFiles: "none",
      hasInitializedSubmodules: false,
      closeHook: {
        command: hookCommand,
        target: hookTarget,
        executableAvailable: deps.isExecutable(hookArgv[0] ?? ""),
      },
    };
  }

  const status = await commandOrThrow(deps.exec, [
    "git",
    "-C",
    target.path,
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  const statusLines = status.output.split("\n").filter(Boolean);
  const submodules = await commandOrThrow(deps.exec, [
    "git",
    "-C",
    target.path,
    "submodule",
    "status",
    "--recursive",
  ]);

  return {
    platform: deps.platform,
    worktree: {
      path: target.path,
      repositoryRoot: primary?.path ?? plan.repositoryRoot,
      branch: target.branch,
      isCurrent: true,
      isLinked: true,
      isPrimary: primary ? pathsMatch(target.path, primary.path) : false,
      isLocked: target.locked === true,
      isPrunable: target.prunable,
    },
    gitOperation: await findGitOperation(target.path, deps),
    hasTrackedChanges: statusLines.some((line) => !line.startsWith("??")),
    untrackedFiles: statusLines.some((line) => line.startsWith("??"))
      ? "non-ignored"
      : "none",
    hasInitializedSubmodules: submodules.output
      .split("\n")
      .some((line) => line !== "" && !line.startsWith("-")),
    closeHook: {
      command: hookCommand,
      target: hookTarget,
      executableAvailable: deps.isExecutable(hookArgv[0] ?? ""),
    },
  };
}
