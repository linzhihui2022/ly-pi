# 03 — Expose close worktree from Pi

**What to build:** The complete `/close-worktree` experience in an idle Pi TUI: validate the Current Worktree, show a deliberate confirmation summary, start the detached cleanup worker, and then request graceful Pi shutdown. It also documents the user-owned terminal-close integration.

**Blocked by:** 02 — Run post-exit worktree closure

**Status:** resolved
**Risk:** High
**Approval:** The user approved this scope, design, and ticket breakdown on 2026-08-21; the recorded approval applies only to the constraints in the close-worktree specification.

- [x] The zero-argument command rejects non-interactive, busy, or ineligible invocations without changing Pi or any worktree.
- [x] Its confirmation identifies the target and retained branch, warns about ignored-file deletion and the absence of external-process scanning, and cancellation leaves everything untouched.
- [x] A confirmed action starts the worker before graceful shutdown; worker-start failure keeps Pi running and no path closes a terminal before successful worktree removal.
- [x] Mocked Pi integration verifies the entry-point behavior, and user-facing worktree documentation explains the hook ABI without portraying the Worktree Widget as mutating.

## Answer

Implemented `/close-worktree` in `my-worktree`. The command performs the shared closability preflight, presents the required confirmation, starts a detached worker, then requests graceful Pi shutdown only after an IPC readiness handshake proves that the worker validated its request, changed to the repository root, and scheduled its PID wait. Startup errors, timeouts, early exits, and late readiness messages retain Pi; a live failed worker is SIGKILLed and its exit is confirmed before the command rejects. The existing post-exit worker remains the only path that invokes the terminal hook after normal Git removal.

Added mocked command, worker-launch, readiness, and failure-race coverage; documented the hook ABI and the Worktree Widget's read-only boundary in the module, root, and ADR documentation. `bun run verify` passed (942 tests), as did the extension build. Real Pi shutdown and terminal-controller interaction remain the specified fake-only residual risk.
