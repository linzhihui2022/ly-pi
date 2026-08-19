# pi-w <branch>: create a git worktree for <branch> at .worktree/<branch>
# (new branch from HEAD if it does not exist; if the dir is taken, mint
# <branch>-<hash> from the original branch). Prints the worktree dir to
# stdout; all diagnostics go to stderr, so `cd $(pi-w x)` works.
#
# If $PI_W_SPAWN is set, it is used as a launcher prefix that must accept
# "<dir> -- <argv...>", e.g.:
#   export PI_W_SPAWN='wezterm cli spawn --cwd'
# The spawned command runs pi, then drops to an interactive zsh on exit.
#
# Thin wrapper around the TypeScript implementation in tools/pi-w (unit
# tested there). Sourced from ~/.zshrc. $0 in a sourced file is the file
# path, so resolve the repo root at source time (inside the function body
# $0 would be the caller's shell name).
_PI_W_REPO="${0:A:h}"
pi-w() {
  bun run "$_PI_W_REPO/tools/pi-w/index.ts" "$@"
}
