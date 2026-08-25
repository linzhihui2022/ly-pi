export type UntrackedFiles = "none" | "ignored-only" | "non-ignored";

export interface WorktreeClosureFacts {
  platform: string;
  worktree: {
    path: string;
    repositoryRoot: string;
    branch: string | null;
    isCurrent: boolean;
    isLinked: boolean;
    isPrimary: boolean;
    isLocked: boolean;
    isPrunable: boolean;
  };
  gitOperation: string | null;
  hasTrackedChanges: boolean;
  untrackedFiles: UntrackedFiles;
  hasInitializedSubmodules: boolean;
  closeHook: {
    command: string | undefined;
    target: string | undefined;
    executableAvailable: boolean;
  };
}

export interface ExpectedSafetyState {
  readonly isCurrent: true;
  readonly isLinked: true;
  readonly isPrimary: false;
  readonly isLocked: false;
  readonly isPrunable: false;
  readonly gitOperation: null;
  readonly hasTrackedChanges: false;
  readonly untrackedFiles: "none" | "ignored-only";
  readonly hasInitializedSubmodules: false;
}

export interface WorktreeClosePlan {
  readonly repositoryRoot: string;
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly expectedSafetyState: ExpectedSafetyState;
  readonly hookArgv: readonly string[];
}

export type WorktreeClosureRefusalCode =
  | "unsupported-platform"
  | "not-current-worktree"
  | "unlinked-worktree"
  | "prunable-worktree"
  | "primary-worktree"
  | "locked-worktree"
  | "git-operation-in-progress"
  | "tracked-changes"
  | "untracked-files"
  | "initialized-submodules"
  | "missing-close-hook-command"
  | "malformed-close-hook-command"
  | "missing-close-hook-target"
  | "unresolvable-close-hook-command";

export type WorktreeClosureAssessment =
  | { status: "ready"; plan: WorktreeClosePlan }
  | {
      status: "refused";
      code: WorktreeClosureRefusalCode;
      message: string;
    };

export function assessWorktreeClosure(
  facts: WorktreeClosureFacts,
): WorktreeClosureAssessment {
  if (facts.platform !== "darwin") {
    return {
      status: "refused",
      code: "unsupported-platform",
      message: "/close-worktree is available only on macOS.",
    };
  }

  if (!facts.worktree.isCurrent) {
    return {
      status: "refused",
      code: "not-current-worktree",
      message: "/close-worktree can only close the current worktree.",
    };
  }

  if (!facts.worktree.isLinked) {
    return {
      status: "refused",
      code: "unlinked-worktree",
      message: "The current worktree is no longer linked to Git.",
    };
  }

  if (facts.worktree.isPrunable) {
    return {
      status: "refused",
      code: "prunable-worktree",
      message: "The current worktree record is prunable.",
    };
  }

  if (facts.worktree.isPrimary) {
    return {
      status: "refused",
      code: "primary-worktree",
      message: "The primary worktree cannot be closed.",
    };
  }

  if (facts.worktree.isLocked) {
    return {
      status: "refused",
      code: "locked-worktree",
      message: "The current worktree is locked.",
    };
  }

  if (facts.gitOperation) {
    return {
      status: "refused",
      code: "git-operation-in-progress",
      message: `Cannot close while Git ${facts.gitOperation} is in progress.`,
    };
  }

  if (facts.hasTrackedChanges) {
    return {
      status: "refused",
      code: "tracked-changes",
      message: "The current worktree has tracked changes.",
    };
  }

  if (facts.untrackedFiles === "non-ignored") {
    return {
      status: "refused",
      code: "untracked-files",
      message: "The current worktree has non-ignored untracked files.",
    };
  }

  if (facts.hasInitializedSubmodules) {
    return {
      status: "refused",
      code: "initialized-submodules",
      message: "The current worktree has initialized submodules.",
    };
  }

  const command = facts.closeHook.command?.trim();
  const target = facts.closeHook.target;

  if (!command) {
    return {
      status: "refused",
      code: "missing-close-hook-command",
      message: "PI_W_CLOSE must contain a terminal close command.",
    };
  }

  if (/['"]/.test(command)) {
    return {
      status: "refused",
      code: "malformed-close-hook-command",
      message: "PI_W_CLOSE does not support quoted arguments.",
    };
  }

  if (!target?.trim()) {
    return {
      status: "refused",
      code: "missing-close-hook-target",
      message: "PI_W_CLOSE_TARGET must identify a terminal target.",
    };
  }

  if (!facts.closeHook.executableAvailable) {
    return {
      status: "refused",
      code: "unresolvable-close-hook-command",
      message: "The PI_W_CLOSE command cannot be resolved.",
    };
  }

  const hookArgv = Object.freeze([...command.split(/\s+/), target]);
  const expectedSafetyState = Object.freeze({
    isCurrent: true,
    isLinked: true,
    isPrimary: false,
    isLocked: false,
    isPrunable: false,
    gitOperation: null,
    hasTrackedChanges: false,
    untrackedFiles:
      facts.untrackedFiles === "ignored-only" ? "ignored-only" : "none",
    hasInitializedSubmodules: false,
  } as const);
  const plan = Object.freeze({
    repositoryRoot: facts.worktree.repositoryRoot,
    worktreePath: facts.worktree.path,
    branch: facts.worktree.branch,
    expectedSafetyState,
    hookArgv,
  });

  return { status: "ready", plan };
}
