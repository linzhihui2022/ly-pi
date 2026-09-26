# 02 — Run post-exit worktree closure

**What to build:** Given an approved close plan and the Pi process identity, a detached cleanup worker that independently waits for graceful Pi exit, rechecks the Closable Worktree boundary, removes the worktree normally, and invokes the Worktree Close Hook only after that removal succeeds.

**Blocked by:** 01 — Define closable worktree safety

**Status:** resolved
**Risk:** High
**Approval:** The user approved this scope, design, and ticket breakdown on 2026-08-21; the recorded approval applies only to the constraints in the close-worktree specification.

- [x] The worker waits no longer than 30 seconds for Pi to exit and leaves the worktree and terminal untouched when that wait times out.
- [x] It revalidates the complete safety boundary outside the target worktree before normal Git removal, never uses force removal, and preserves the local branch.
- [x] It calls the configured hook only after successful removal; revalidation, removal, and hook failures retain the terminal and emit actionable recovery diagnostics.
- [x] Temporary Git fixtures and a fake close hook verify the success and all failure paths without opening a real Pi process or terminal pane.

## Answer

Implemented a self-contained post-exit worker asset and its build/deploy pipeline. It TypeBox-validates the serialized request, changes to the repository root before waiting, independently collects Git facts, reuses the Closure Assessment boundary, removes only with normal `git worktree remove`, and invokes the planned argv without a shell only after removal succeeds. Temporary Git fixtures cover success, timeout, dirty revalidation, simulated removal failure, and hook failure; branch retention and ignored-file eligibility are asserted. `bun run verify` and the built-asset invalid-input smoke check passed. The real Pi shutdown and terminal-controller interaction remain the specified fake-only residual risk.
