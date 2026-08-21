# 03 — Expose close worktree from Pi

**What to build:** The complete `/close-worktree` experience in an idle Pi TUI: validate the Current Worktree, show a deliberate confirmation summary, start the detached cleanup worker, and then request graceful Pi shutdown. It also documents the user-owned terminal-close integration.

**Blocked by:** 02 — Run post-exit worktree closure

**Status:** ready-for-agent
**Risk:** High
**Approval:** The user approved this scope, design, and ticket breakdown on 2026-08-21; the recorded approval applies only to the constraints in the close-worktree specification.

- [ ] The zero-argument command rejects non-interactive, busy, or ineligible invocations without changing Pi or any worktree.
- [ ] Its confirmation identifies the target and retained branch, warns about ignored-file deletion and the absence of external-process scanning, and cancellation leaves everything untouched.
- [ ] A confirmed action starts the worker before graceful shutdown; worker-start failure keeps Pi running and no path closes a terminal before successful worktree removal.
- [ ] Mocked Pi integration verifies the entry-point behavior, and user-facing worktree documentation explains the hook ABI without portraying the Worktree Widget as mutating.
