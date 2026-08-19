# my-worktree

A read-only Pi widget that shows Git worktrees above the editor when the
current repository has at least two visible worktrees.

## Display

The widget follows the Todo panel's tree layout:

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

## Visibility and refresh

Only accessible, non-prunable worktrees are shown. The widget hides silently
when Git is unavailable, discovery fails, or fewer than two worktrees remain
visible.

It refreshes at session startup and at the start and end of every turn. It has
no command, configuration, polling loop, filesystem watcher, or worktree
switching behavior.

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
