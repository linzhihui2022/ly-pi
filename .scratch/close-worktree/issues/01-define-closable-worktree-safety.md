# 01 — Define closable worktree safety

**What to build:** An authoritative safety decision that turns the Current Worktree and terminal-close environment into either an immutable close plan or a user-readable refusal. Pi orchestration and the post-exit worker must share this boundary so their safety decisions cannot drift.

**Blocked by:** None — can start immediately.

**Status:** resolved
**Risk:** High
**Approval:** The user approved this scope, design, and ticket breakdown on 2026-08-21; the recorded approval applies only to the constraints in the close-worktree specification.

- [x] A plan is produced only for the current, linked, non-primary, unlocked worktree with no active Git operation, tracked or non-ignored untracked change, or initialized submodule; ignored-only files remain eligible.
- [x] Unsupported platforms and missing, malformed, or unresolvable Worktree Close Hook configuration produce actionable refusals before Pi shutdown.
- [x] The accepted plan retains the target, repository context, expected safety state, and terminal-hook data needed for an independent post-exit recheck.
- [x] Focused behavior tests cover every eligibility and refusal outcome without changing a real worktree.

## Answer

Implemented the pure Closure Assessment module and its behavior tests. The module returns an immutable close plan only for a Closable Worktree, rejects every scoped unsafe state and invalid hook configuration, and preserves the whitespace-split hook argv contract. Full `bun run verify` passed; the two-axis review found and resolved the quoted-command validation gap before completion.
