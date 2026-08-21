import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import {
  type PostExitWorktreeClosureDeps,
  type PostExitWorktreeClosureRequest,
  runPostExitWorktreeClosure,
} from "./close-worker";
import { CLOSE_WORKTREE_WORKER_READY } from "./close-worker-protocol";
import { createSystemPostExitWorktreeClosureDeps } from "./close-worker-runtime";
import type { WorktreeClosePlan } from "./closure";

const ExpectedSafetyStateSchema = Type.Object(
  {
    isCurrent: Type.Literal(true),
    isLinked: Type.Literal(true),
    isPrimary: Type.Literal(false),
    isLocked: Type.Literal(false),
    isPrunable: Type.Literal(false),
    gitOperation: Type.Null(),
    hasTrackedChanges: Type.Literal(false),
    untrackedFiles: Type.Union([
      Type.Literal("none"),
      Type.Literal("ignored-only"),
    ]),
    hasInitializedSubmodules: Type.Literal(false),
  },
  { additionalProperties: false },
);

const ClosePlanSchema = Type.Object(
  {
    repositoryRoot: Type.String({ minLength: 1 }),
    worktreePath: Type.String({ minLength: 1 }),
    branch: Type.Union([Type.String(), Type.Null()]),
    expectedSafetyState: ExpectedSafetyStateSchema,
    hookArgv: Type.Array(Type.String({ minLength: 1 }), { minItems: 2 }),
  },
  { additionalProperties: false },
);

const CloseRequestSchema = Type.Object(
  {
    piPid: Type.Number(),
    plan: ClosePlanSchema,
  },
  { additionalProperties: false },
);

type SerializedCloseRequest = Static<typeof CloseRequestSchema>;

export interface CloseWorkerCliDeps {
  chdir(directory: string): void;
  report(message: string): void;
  createDeps(): PostExitWorktreeClosureDeps;
}

function parseClosePlan(
  value: SerializedCloseRequest["plan"],
): WorktreeClosePlan | null {
  if (
    !isAbsolute(value.repositoryRoot) ||
    !isAbsolute(value.worktreePath) ||
    resolve(value.repositoryRoot) === resolve(value.worktreePath) ||
    value.hookArgv.some(
      (argument) => argument.trim() === "" || /['"]/.test(argument),
    )
  ) {
    return null;
  }

  return Object.freeze({
    repositoryRoot: value.repositoryRoot,
    worktreePath: value.worktreePath,
    branch: value.branch,
    expectedSafetyState: Object.freeze({
      isCurrent: true,
      isLinked: true,
      isPrimary: false,
      isLocked: false,
      isPrunable: false,
      gitOperation: null,
      hasTrackedChanges: false,
      untrackedFiles: value.expectedSafetyState.untrackedFiles,
      hasInitializedSubmodules: false,
    }),
    hookArgv: Object.freeze([...value.hookArgv]),
  });
}

function parseCloseRequest(
  value: unknown,
): PostExitWorktreeClosureRequest | null {
  if (
    !Value.Check(CloseRequestSchema, value) ||
    !Number.isSafeInteger(value.piPid) ||
    value.piPid <= 0
  ) {
    return null;
  }

  const plan = parseClosePlan(value.plan);
  return plan ? Object.freeze({ piPid: value.piPid, plan }) : null;
}

export async function runCloseWorktreeWorker(
  args: string[],
  deps: CloseWorkerCliDeps,
  onReady?: () => void,
): Promise<number> {
  if (args.length !== 1) {
    deps.report("close-worktree worker: invalid close plan input.");
    return 1;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(args[0]);
  } catch {
    deps.report("close-worktree worker: invalid close plan input.");
    return 1;
  }

  const request = parseCloseRequest(parsed);
  if (!request) {
    deps.report("close-worktree worker: invalid close plan input.");
    return 1;
  }

  try {
    deps.chdir(request.plan.repositoryRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.report(
      `close-worktree worker: cannot enter repository root: ${message}`,
    );
    return 1;
  }

  const outcome = await runPostExitWorktreeClosure(
    request,
    deps.createDeps(),
    onReady,
  );
  return outcome === "completed" ? 0 : 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = await runCloseWorktreeWorker(
    process.argv.slice(2),
    {
      chdir: process.chdir,
      report: console.error,
      createDeps: createSystemPostExitWorktreeClosureDeps,
    },
    () => {
      process.send?.(CLOSE_WORKTREE_WORKER_READY);
    },
  );
}
