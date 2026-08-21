import {
  assessWorktreeClosure,
  type WorktreeClosePlan,
  type WorktreeClosureFacts,
} from "./closure";

export const PID_EXIT_TIMEOUT_MS = 30_000;

export interface PostExitWorktreeClosureRequest {
  piPid: number;
  plan: WorktreeClosePlan;
}

export interface WorkerCommandResult {
  code: number;
  output: string;
}

export interface PostExitWorktreeClosureDeps {
  waitForPidExit(
    pid: number,
    timeoutMs: number,
    onWaiting?: () => void,
  ): Promise<boolean>;
  inspectWorktree(plan: WorktreeClosePlan): Promise<WorktreeClosureFacts>;
  removeWorktree(
    repositoryRoot: string,
    worktreePath: string,
  ): Promise<WorkerCommandResult>;
  runHook(argv: readonly string[]): Promise<WorkerCommandResult>;
  report(message: string): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function recoveryCommand(plan: WorktreeClosePlan): string {
  return `Recover with: cd ${shellQuote(plan.repositoryRoot)}`;
}

function retainedWorktree(plan: WorktreeClosePlan): string {
  return `Worktree left at ${plan.worktreePath}. ${recoveryCommand(plan)}`;
}

export async function runPostExitWorktreeClosure(
  request: PostExitWorktreeClosureRequest,
  deps: PostExitWorktreeClosureDeps,
  onReady?: () => void,
): Promise<
  | "timed-out"
  | "revalidation-failed"
  | "removal-failed"
  | "hook-failed"
  | "completed"
> {
  const exited = onReady
    ? await deps.waitForPidExit(request.piPid, PID_EXIT_TIMEOUT_MS, onReady)
    : await deps.waitForPidExit(request.piPid, PID_EXIT_TIMEOUT_MS);
  if (!exited) {
    deps.report(
      `close-worktree: Pi did not exit within 30 seconds. ${retainedWorktree(request.plan)}`,
    );
    return "timed-out";
  }

  let facts: WorktreeClosureFacts;
  try {
    facts = await deps.inspectWorktree(request.plan);
  } catch (error) {
    deps.report(
      `close-worktree: revalidation could not be completed: ${errorMessage(error)}. ${retainedWorktree(request.plan)}`,
    );
    return "revalidation-failed";
  }

  const assessment = assessWorktreeClosure(facts);
  const planMatches =
    facts.worktree.path === request.plan.worktreePath &&
    facts.worktree.repositoryRoot === request.plan.repositoryRoot &&
    facts.worktree.branch === request.plan.branch;
  if (assessment.status === "refused" || !planMatches) {
    const message =
      assessment.status === "refused"
        ? assessment.message
        : "The worktree no longer matches the approved close plan.";
    deps.report(
      `close-worktree: revalidation failed: ${message} ${retainedWorktree(request.plan)}`,
    );
    return "revalidation-failed";
  }

  let removal: WorkerCommandResult;
  try {
    removal = await deps.removeWorktree(
      request.plan.repositoryRoot,
      request.plan.worktreePath,
    );
  } catch (error) {
    deps.report(
      `close-worktree: worktree removal could not be completed: ${errorMessage(error)}. ${retainedWorktree(request.plan)}`,
    );
    return "removal-failed";
  }
  if (removal.code !== 0) {
    deps.report(
      `close-worktree: worktree removal failed (exit ${removal.code}): ${removal.output.trim() || "no command output"}. ${retainedWorktree(request.plan)}`,
    );
    return "removal-failed";
  }

  let hook: WorkerCommandResult;
  try {
    hook = await deps.runHook(request.plan.hookArgv);
  } catch (error) {
    deps.report(
      `close-worktree: worktree was removed, but terminal hook could not be run: ${errorMessage(error)}. argv: ${JSON.stringify(request.plan.hookArgv)}. ${recoveryCommand(request.plan)}`,
    );
    return "hook-failed";
  }
  if (hook.code !== 0) {
    deps.report(
      `close-worktree: worktree was removed, but terminal hook failed (exit ${hook.code}): ${JSON.stringify(request.plan.hookArgv)}. ${recoveryCommand(request.plan)}`,
    );
    return "hook-failed";
  }

  return "completed";
}
