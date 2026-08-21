# 02 — Run post-exit worktree closure

**What to build:** Given an approved close plan and the Pi process identity, a detached cleanup worker that independently waits for graceful Pi exit, rechecks the Closable Worktree boundary, removes the worktree normally, and invokes the Worktree Close Hook only after that removal succeeds.

**Blocked by:** 01 — Define closable worktree safety

**Status:** ready-for-agent
**Risk:** High
**Approval:** The user approved this scope, design, and ticket breakdown on 2026-08-21; the recorded approval applies only to the constraints in the close-worktree specification.

- [ ] The worker waits no longer than 30 seconds for Pi to exit and leaves the worktree and terminal untouched when that wait times out.
- [ ] It revalidates the complete safety boundary outside the target worktree before normal Git removal, never uses force removal, and preserves the local branch.
- [ ] It calls the configured hook only after successful removal; revalidation, removal, and hook failures retain the terminal and emit actionable recovery diagnostics.
- [ ] Temporary Git fixtures and a fake close hook verify the success and all failure paths without opening a real Pi process or terminal pane.
