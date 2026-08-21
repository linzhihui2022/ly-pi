# Close Current Worktree

**Status:** draft
**Risk:** High
**Implementation approval:** not yet granted

## Problem Statement

Pi worktrees created for a focused task can remain after the task finishes. A user needs one deliberate command that safely closes the current task worktree, preserves its local branch, exits Pi cleanly, removes the worktree, and then delegates terminal closure to their own terminal integration.

## Solution

Extend `my-worktree` into the repository's worktree-management module. This delivery adds exactly one mutating command, `/close-worktree`; the existing Worktree Widget remains read-only. The command acts only on the Current Worktree and proceeds only when it is a Closable Worktree. It never uses Git force-removal or deletes a branch.

The command is macOS-only. Terminal closure is an explicit environment integration rather than a hard-coded WezTerm call:

```bash
export PI_W_CLOSE='wezterm cli kill-pane --pane-id'
export PI_W_CLOSE_TARGET="$WEZTERM_PANE"
```

`PI_W_CLOSE` follows `PI_W_SPAWN` semantics: split its trimmed value on whitespace and append `PI_W_CLOSE_TARGET` as one final argument. There is no shell interpolation, quoting syntax, default terminal command, or implicit cwd-based pane discovery.

## User Stories

1. As a Pi user in a completed auxiliary worktree, I can run `/close-worktree` to end the task without manually coordinating Pi, Git, and my terminal.
2. As a Pi user, I see a confirmation summary before any shutdown or deletion occurs.
3. As a Pi user, I am protected from closing the primary worktree, another worktree, a locked worktree, or a worktree with relevant local state.
4. As a Pi user, I keep the local branch after the worktree directory is removed.
5. As a Pi user, I can configure the terminal-specific final close action through my environment instead of requiring WezTerm.
6. As a Pi user, if cleanup cannot complete, I retain a usable terminal with a concrete diagnostic and recovery command.

## Scope and Module Boundary

`my-worktree` is now the worktree-management module, but this release implements only Worktree Closure. Its widget remains a display-only Worktree Widget: there is no worktree picker, cwd switching, session switching, creation command, generic removal command, prune command, or future-operation abstraction added speculatively.

This specification supersedes the original `my-worktree` specification's initial-release prohibition on commands and Git mutations only for `/close-worktree`; all other original read-only widget behavior remains intact.

## Command Contract

`/close-worktree` accepts no arguments and is available only from an idle interactive TUI session. Any argument, non-TUI invocation, or active agent operation fails before state changes.

The command targets only the linked Git worktree containing the current Pi session cwd. It never accepts a path or branch argument and rejects a non-Git directory, the primary worktree, a stale/prunable record, or a target that no longer matches the current worktree.

## Closable Worktree Preflight

Before confirmation, the command must establish all of the following:

- the target is a current, linked, non-primary Git worktree;
- the worktree is not locked;
- no rebase, merge, cherry-pick, revert, bisect, or equivalent Git operation is in progress;
- `git status --porcelain` reports no tracked or non-ignored untracked changes;
- no initialized submodule is present;
- `PI_W_CLOSE` and `PI_W_CLOSE_TARGET` are non-empty, and the command executable in `PI_W_CLOSE` can be resolved on macOS;
- the platform is macOS.

Git-ignored files deliberately do not block closure. They can be removed with the worktree directory under Git's normal, non-force behavior. The command never passes `--force` to `git worktree remove`.

The implementation must not run `lsof` or another system-wide process scan. The confirmation instead warns that Git cleanliness does not prove that no other process is using the directory.

## Confirmation and Lifecycle

After preflight, the confirmation UI must state:

- the worktree path and retained local branch;
- that ignored files in the directory may be deleted;
- that no external-process scan was performed;
- that Pi will exit, the worktree will be removed only if the post-exit revalidation passes, and the configured terminal hook will run only after successful removal.

Cancellation leaves Pi and the worktree untouched.

After confirmation, the extension starts a detached watcher **before** calling `ctx.shutdown()`. If the watcher cannot start, the command reports the failure and does not request Pi shutdown. The watcher receives an immutable close plan: Pi PID, common repository root, target worktree path, expected Git state, close-hook argv prefix, and close target.

Pi then uses `ctx.shutdown()` for graceful shutdown. The watcher waits at most 30 seconds for that PID to disappear. It does nothing further on timeout except emit a terminal diagnostic.

After Pi exits, the watcher runs from outside the target worktree and revalidates the same closability conditions. On a successful revalidation, it runs:

```text
git -C <repository-root> worktree remove <target-worktree>
```

No force flag is permitted. A Git revalidation or removal failure preserves the terminal and writes the error plus recovery guidance to it.

Only after successful Git removal does the watcher invoke:

```text
splitWords(PI_W_CLOSE) + [PI_W_CLOSE_TARGET]
```

If that hook fails, the terminal remains open and receives the hook argv, exit code, confirmation that the worktree was already removed, and a directly usable `cd <repository-root>` recovery command for a shell whose cwd may now be deleted.

## Validation Contract

Implementation follows TDD and must include:

- pure tests for every closability outcome: primary/current/linked detection, lock, active Git operation, tracked change, non-ignored untracked file, ignored-only file, initialized submodule, missing/invalid hook configuration, and unsupported platform;
- command integration tests for rejected preflight, confirmation cancel, watcher-start failure, and accepted shutdown request;
- watcher tests using a temporary Git fixture and a fake close CLI/hook that records argv, exit status, timeout behavior, revalidation failure, Git removal failure, and post-removal hook failure;
- assertions that branch retention and no-`--force` behavior are preserved.

The accepted validation level is fake-only integration. No test opens or closes a real Pi process or terminal pane; this leaves real Pi shutdown and terminal-controller interaction as an explicit residual risk.

## Documentation Contract

- Keep `CONTEXT.md` terminology aligned with Closable Worktree, Worktree Closure, Worktree Close Hook, and Worktree Widget.
- Update `ly-pi/my-worktree/README.md` and the prior widget documentation to explain the module's new command without representing the widget itself as mutating.
- Record the external environment ABI in ADR-0010 and user-facing docs, including the whitespace-splitting limitation of `PI_W_CLOSE`.

## Out of Scope

- Worktree creation, listing commands, switching, cwd/session migration, generic target selection, pruning, or batch management.
- Branch deletion, remote branch changes, commits, stashes, or any use of `git worktree remove --force`.
- Closing a primary worktree, dirty worktree, locked worktree, worktree with an active Git operation, or worktree containing initialized submodules.
- Windows or Linux support.
- A default terminal closer, hard-coded WezTerm dependency, cwd-based pane inference, command arguments for a terminal target, or configuration-file UI.
- External-process scanning and real terminal/Pi end-to-end tests.
- Persistent close logs or automatic retries.

## Further Notes

The `PI_W_CLOSE` / `PI_W_CLOSE_TARGET` ABI is intentionally user-owned and is documented by `docs/adr/0010-configurable-worktree-close-hook.md`. This specification is ready for review; implementation requires an explicit subsequent approval and ticket breakdown.
