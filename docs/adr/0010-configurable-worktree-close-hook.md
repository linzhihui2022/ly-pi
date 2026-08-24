# Make worktree terminal closure configurable

`/close-worktree` is macOS-only but does not hard-code WezTerm. Terminal
closure is a user-owned environment ABI:

```bash
export PI_W_CLOSE='wezterm cli kill-pane --pane-id'
export PI_W_CLOSE_TARGET="$WEZTERM_PANE"
```

Pi trims `PI_W_CLOSE`, splits it on whitespace, then appends
`PI_W_CLOSE_TARGET` verbatim as one final argv item. `PI_W_CLOSE` has no shell
interpolation or quoting syntax, so arguments embedded in that value cannot
contain whitespace. Executable lookup happens from the primary repository
root, which is also the detached worker's cwd. Pi provides no default terminal
command and never discovers a pane from its cwd. This mirrors `PI_W_SPAWN`'s
explicit launcher convention and can target WezTerm, tmux, or another
user-managed terminal controller.

Pi invokes this hook only after a detached watcher observes the Pi PID has
exited, revalidates the target, and successfully removes the worktree. Missing
or failing hooks preserve the terminal and report recovery guidance; a hook
failure never restores an already removed worktree.
