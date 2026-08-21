import { describe, expect, it } from "vitest";
import { assessWorktreeClosure, type WorktreeClosureFacts } from "./closure";

function cleanFacts(): WorktreeClosureFacts {
  return {
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
  };
}

describe("Closure Assessment", () => {
  it("creates an immutable close plan for a clean current linked worktree", () => {
    expect(assessWorktreeClosure(cleanFacts())).toEqual({
      status: "ready",
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
    });
  });

  it("refuses to close outside macOS", () => {
    expect(
      assessWorktreeClosure({ ...cleanFacts(), platform: "linux" }),
    ).toEqual({
      status: "refused",
      code: "unsupported-platform",
      message: "/close-worktree is available only on macOS.",
    });
  });

  it("refuses a worktree other than the current worktree", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, isCurrent: false },
      }),
    ).toEqual({
      status: "refused",
      code: "not-current-worktree",
      message: "/close-worktree can only close the current worktree.",
    });
  });

  it("refuses a worktree that is no longer linked", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, isLinked: false },
      }),
    ).toEqual({
      status: "refused",
      code: "unlinked-worktree",
      message: "The current worktree is no longer linked to Git.",
    });
  });

  it("refuses the primary worktree", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, isPrimary: true },
      }),
    ).toEqual({
      status: "refused",
      code: "primary-worktree",
      message: "The primary worktree cannot be closed.",
    });
  });

  it("refuses a locked worktree", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, isLocked: true },
      }),
    ).toEqual({
      status: "refused",
      code: "locked-worktree",
      message: "The current worktree is locked.",
    });
  });

  it("refuses a prunable worktree record", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, isPrunable: true },
      }),
    ).toEqual({
      status: "refused",
      code: "prunable-worktree",
      message: "The current worktree record is prunable.",
    });
  });

  it("refuses a worktree with a Git operation in progress", () => {
    expect(
      assessWorktreeClosure({ ...cleanFacts(), gitOperation: "rebase" }),
    ).toEqual({
      status: "refused",
      code: "git-operation-in-progress",
      message: "Cannot close while Git rebase is in progress.",
    });
  });

  it("refuses a worktree with tracked changes", () => {
    expect(
      assessWorktreeClosure({ ...cleanFacts(), hasTrackedChanges: true }),
    ).toEqual({
      status: "refused",
      code: "tracked-changes",
      message: "The current worktree has tracked changes.",
    });
  });

  it("refuses a worktree with non-ignored untracked files", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        untrackedFiles: "non-ignored",
      }),
    ).toEqual({
      status: "refused",
      code: "untracked-files",
      message: "The current worktree has non-ignored untracked files.",
    });
  });

  it("allows a worktree containing only ignored files", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        untrackedFiles: "ignored-only",
      }),
    ).toMatchObject({
      status: "ready",
      plan: { expectedSafetyState: { untrackedFiles: "ignored-only" } },
    });
  });

  it("retains the absence of a local branch for a detached worktree", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        worktree: { ...cleanFacts().worktree, branch: null },
      }),
    ).toMatchObject({ status: "ready", plan: { branch: null } });
  });

  it("appends the terminal target as one argv item", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, target: "pane 150" },
      }),
    ).toMatchObject({
      status: "ready",
      plan: {
        hookArgv: ["wezterm", "cli", "kill-pane", "--pane-id", "pane 150"],
      },
    });
  });

  it("refuses a worktree with initialized submodules", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        hasInitializedSubmodules: true,
      }),
    ).toEqual({
      status: "refused",
      code: "initialized-submodules",
      message: "The current worktree has initialized submodules.",
    });
  });

  it("refuses a missing terminal close command", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, command: undefined },
      }),
    ).toEqual({
      status: "refused",
      code: "missing-close-hook-command",
      message: "PI_W_CLOSE must contain a terminal close command.",
    });
  });

  it("refuses an empty terminal close command", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, command: "  " },
      }),
    ).toEqual({
      status: "refused",
      code: "missing-close-hook-command",
      message: "PI_W_CLOSE must contain a terminal close command.",
    });
  });

  it("refuses a missing terminal close target", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, target: undefined },
      }),
    ).toEqual({
      status: "refused",
      code: "missing-close-hook-target",
      message: "PI_W_CLOSE_TARGET must identify a terminal target.",
    });
  });

  it("refuses quoted terminal close arguments", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, command: 'wezterm "cli' },
      }),
    ).toEqual({
      status: "refused",
      code: "malformed-close-hook-command",
      message: "PI_W_CLOSE does not support quoted arguments.",
    });
  });

  it("refuses an empty terminal close target", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, target: " " },
      }),
    ).toEqual({
      status: "refused",
      code: "missing-close-hook-target",
      message: "PI_W_CLOSE_TARGET must identify a terminal target.",
    });
  });

  it("refuses an unresolvable terminal close command", () => {
    expect(
      assessWorktreeClosure({
        ...cleanFacts(),
        closeHook: { ...cleanFacts().closeHook, executableAvailable: false },
      }),
    ).toEqual({
      status: "refused",
      code: "unresolvable-close-hook-command",
      message: "The PI_W_CLOSE command cannot be resolved.",
    });
  });

  it("freezes the close plan before giving it to a caller", () => {
    const assessment = assessWorktreeClosure(cleanFacts());

    expect(assessment.status).toBe("ready");
    if (assessment.status !== "ready") return;

    expect(Object.isFrozen(assessment.plan)).toBe(true);
    expect(Object.isFrozen(assessment.plan.expectedSafetyState)).toBe(true);
    expect(Object.isFrozen(assessment.plan.hookArgv)).toBe(true);
  });
});
