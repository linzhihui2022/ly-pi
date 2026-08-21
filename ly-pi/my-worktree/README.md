# my-worktree

`my-worktree` is a Pi worktree-management module. Its Worktree Widget remains
read-only: it shows Git worktrees above the editor when the current repository
has at least two visible worktrees. The module also provides the separately
invoked `/close-worktree` command for closing only the Current Worktree.

## Display

The Worktree Widget follows the Todo panel's tree layout:

```text
● Worktrees (2)
├─ ○ main <REPO>
└─ ● my-worktree <REPO>/.worktree/my-worktree
```

- Worktrees keep the order reported by Git.
- `●` and the accent color identify the current worktree; `○` and dim text
  identify other worktrees.
- A branch name is shown when available. Detached `HEAD` worktrees show the
  first seven characters of their commit SHA instead.
- The primary worktree root is abbreviated as `<REPO>`, including paths below
  it. Worktrees outside that path retain their absolute paths.
- On narrow terminals, the beginning of a path is truncated so its ending stays
  visible.

## `/close-worktree`

The command takes no arguments and is available only from an idle interactive
Pi TUI on macOS. It can close only a clean, linked, unlocked Current Worktree
without an active Git operation or initialized submodule. The local branch is
retained; Git removal never uses `--force`.

Before any shutdown, Pi shows the worktree path, retained branch, and warnings
that ignored files may be deleted and no external-process scan was performed.
On confirmation, Pi starts a detached worker, requests graceful shutdown, and
the worker revalidates and removes the worktree. It runs the terminal-close
hook only after successful removal. A refusal, cancellation, worker-start
failure, or post-exit failure leaves the terminal open.

### Terminal-close hook ABI

Terminal integration is user-owned. Set both variables in the terminal
environment that launches Pi:

```bash
export PI_W_CLOSE='wezterm cli kill-pane --pane-id'
export PI_W_CLOSE_TARGET="$WEZTERM_PANE"
```

Pi trims `PI_W_CLOSE`, splits it on whitespace, and appends
`PI_W_CLOSE_TARGET` verbatim as exactly one final argument. `PI_W_CLOSE` does
not support quoting or shell interpolation, so arguments embedded in that
value cannot contain whitespace. Executable lookup runs from the primary
repository root, which is also the detached worker's cwd. There is no default
terminal command or cwd-based target discovery. The hook may target WezTerm,
tmux, or another terminal controller; `my-worktree` does not hard-code one.

## Visibility and refresh

Only accessible, non-prunable worktrees are shown. The Worktree Widget hides
silently when Git is unavailable, discovery fails, or fewer than two worktrees
remain visible.

The widget refreshes at session startup and at the start and end of every turn.
The widget itself has no command, configuration, polling loop, filesystem
watcher, or worktree-switching behavior.

## Development

```bash
# Focused tests
bun run --cwd ly-pi test -- my-worktree

# Full repository verification
bun run verify

# Build, test, and deploy
bun run deploy
```

After deployment, run `/reload` in Pi to load the updated extension.
