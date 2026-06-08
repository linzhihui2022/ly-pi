# configure

Personal shell, terminal, and coding agent configuration — managed as a git repo.

## Files

| File | Delivery | Description |
|------|----------|-------------|
| `starship.toml` | symlink → `~/.config/starship.toml` | Starship prompt |
| `wezterm.lua` | symlink → `~/.wezterm.lua` | WezTerm terminal |
| `MY-AGENTS.md` | symlink → `~/.pi/agent/AGENTS.md`, `~/.claude/CLAUDE.md` | Global coding agent instructions |
| `AGENTS.md` | auto-discovered by pi | Configure-repo development guide (loaded by pi alongside `MY-AGENTS.md`) |
| `pi-extensions/` | `./install.sh` → `~/.pi/agent/extensions/` | Pi custom extensions (Bun workspaces) |
| `pi-skills/` | `./install.sh` → `~/.pi/agent/skills/` | Custom skills |
| `pi-themes/` | `./install.sh` → `~/.pi/agent/themes/` | Custom themes（仅 `*.json`，排除 `package.json`） |
| `turbo.json` | — | Turborepo pipeline (build → test → deploy) |
| `install.sh` | — | Thin wrapper: `bun run deploy` |

## Setup

```bash
REPO="$HOME/Documents/configure"

# Starship
ln -sf "$REPO/starship.toml" ~/.config/starship.toml

# WezTerm
ln -sf "$REPO/wezterm.lua" ~/.wezterm.lua

# Pi global instructions (also shared with Claude)
ln -sf "$REPO/MY-AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$REPO/MY-AGENTS.md" ~/.claude/CLAUDE.md

# Install dependencies
cd "$REPO" && bun install

# Deploy extensions, skills, themes
"$REPO/install.sh"
```

## Development

### Build, test, deploy

```bash
bunx turbo run build              # Incremental build (cached)
bunx turbo run test               # Incremental test (cached)
bunx turbo run build test deploy  # Full pipeline
bun run deploy                    # One-shot deploy (includes skills/themes)
```

### Quick test a single extension

```bash
pi -e pi-extensions/my-bt/index.ts
```

### Run tests for a single extension

```bash
cd pi-extensions/my-hud && bun test
```

See `AGENTS.md` for the full development guide.
