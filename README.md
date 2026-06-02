# configure

Personal shell, terminal, and coding agent configuration — managed as a git repo.

## Files

| File | Delivery | Description |
|------|----------|-------------|
| `starship.toml` | symlink → `~/.config/starship.toml` | Starship prompt |
| `wezterm.lua` | symlink → `~/.wezterm.lua` | WezTerm terminal |
| `MY-AGENTS.md` | symlink → `~/.pi/agent/AGENTS.md`, `~/.claude/CLAUDE.md` | Global coding agent instructions |
| `AGENTS.md` | auto-discovered by pi | Configure-repo development guide (loaded by pi alongside `MY-AGENTS.md`) |
| `pi-extensions/` | `./install.sh` → `~/.pi/agent/extensions/` | Pi custom extensions (transitional, being replaced by pi-infra) |
| `pi-skills/` | `./install.sh` → `~/.pi/agent/skills/` | Custom skills (superpowers migration) |
| `pi-agents/` | `./install.sh` → `~/.pi/agent/agents/` | Custom subagent definitions |
| `pi-themes/` | `./install.sh` → `~/.pi/agent/themes/` | Custom themes |
| `install.sh` | — | Deploy extensions, skills, and themes to pi agent |
| `.lychee/specs/` | — | Design specs |
| `.lychee/plans/` | — | Implementation plans |

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

# Pi extensions, skills, themes (copied, not symlinked)
"$REPO/install.sh"
```

## Development

See `AGENTS.md` for the full development guide.
