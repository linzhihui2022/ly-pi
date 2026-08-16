# piw [dir]: spawn a new WezTerm tab running pi in the given directory (default: cwd)
# Sourced from ~/.zshrc. WezTerm CLI is not on PATH, use the app bundle binary.
piw() {
  local dir="${1:-$PWD}"
  /Applications/WezTerm.app/Contents/MacOS/wezterm cli spawn --cwd "${dir:A}" -- pi
}
