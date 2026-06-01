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
| `pi-infra/` | `./dev.sh <name>` → `pi -e pi-infra/ly-*/index.ts` or `bundle.ts` | Infrastructure-grade extensions (todo, hud, worktree, permission, ask, subagent, plan-mode, display, tui) |
| `pi-skills/` | `./install.sh` → `~/.pi/agent/skills/` | Custom skills (superpowers migration) |
| `pi-themes/` | `./install.sh` → `~/.pi/agent/themes/` | Custom themes |
| `install.sh` | — | Deploy extensions, skills, and themes to pi agent |
| `.lychee/specs/` | — | Design specs |
| `.lychee/plans/` | — | Implementation plans |

## pi-infra

A collection of infrastructure-grade pi extensions built from scratch with high standards:

| Tool | Plan | Status | Description |
|------|------|--------|-------------|
| `ly-tui` | [plan-5](./.lychee/plans/2026-05-29-pi-infra-plan-5-tui.md) | 🟡 spec done | Declarative TUI framework: Component, Layout, Theme |
| `ly-display` | [plan-10](./.lychee/plans/2026-05-29-pi-infra-plan-10-display.md) | 🟡 spec done | Chat area tool rows, presets, user message box |
| `ly-shared` | [plan-1](./.lychee/plans/2026-05-29-pi-infra-plan-1-shared-todo.md) ff. | 🟡 spec done | Shared library: store, events, config, logger, errors, metrics, ui, client |
| `ly-todo` | [plan-1](./.lychee/plans/2026-05-29-pi-infra-plan-1-shared-todo.md) | 🟡 spec done | Shared TODO list (AI tool + user command) |
| `ly-hud` | [plan-2](./.lychee/plans/2026-05-29-pi-infra-plan-2-shared-hud.md) | 🟡 spec done | Status bar footer: model, tokens, cost, context, TODO, worktree |
| `ly-plan-mode` | [plan-9](./.lychee/plans/2026-05-29-pi-infra-plan-9-plan-mode.md) | 🟡 spec done | Read-only plan mode via `/plan` |
| `ly-worktree` | [plan-3](./.lychee/plans/2026-05-29-pi-infra-plan-3-worktree.md) | 🟡 spec done | Git worktree management via `/wt` |
| `ly-permission` | [plan-4](./.lychee/plans/2026-05-29-pi-infra-plan-4-shared-permission.md) | 🟡 spec done | Tool call authorization engine (allow/deny/ask) |
| `ly-ask` | [plan-6](./.lychee/plans/2026-05-29-pi-infra-plan-6-shared-ask.md) | 🟡 spec done | Inline user interaction: select, confirm, text, multi-tab |
| `ly-subagent` | [plan-7](./.lychee/plans/2026-05-29-pi-infra-plan-7-subagent.md) | 🟡 spec done | Subagent lifecycle: permission, scheduling, approval, tracking |
| `ly-server` | [plan-8](./.lychee/plans/2026-05-29-pi-infra-plan-8-server.md) | 🟡 spec done | Standalone HTTP dashboard: SSE, multi-project, approval UI |

**Build order:** 1 → 2+9 → 3 → 4 → 5+8 → 10 → 6 → 7

**Design spec:** [pi-infra-design.md](./.lychee/specs/2026-05-29-pi-infra-design.md)

### Quality standards

- 100% branch coverage
- Pure functions first (handler, parser, matcher, checker, aggregator)
- Side effects isolated behind interfaces (GitAdapter, RunnerConfig)
- Structured logging
- TDD workflow (test → fail → implement → pass → commit)

### Dashboard server

Standalone HTTP server at `http://127.0.0.1:9876`:

```bash
cd pi-infra/ly-server && npx tsx main.ts
```

- Multi-project, multi-session dashboard
- SSE live updates
- Subagent approval management
- No build step — single HTML file

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

### pi-infra

Run from the repo — no install step:

```bash
./dev.sh              # list extensions
./dev.sh todo         # pi -e pi-infra/ly-todo/index.ts
./dev.sh bundle       # multi-extension dev (ly-display first)
./dev.sh display      # pi -e pi-infra/ly-display/index.ts
./dev.sh server       # dashboard at :9876
./dev.sh hud --test   # tests first, then start
```

`ly-server` dashboard (also via `./dev.sh server`):

```bash
cd pi-infra/ly-server && npx tsx main.ts
# → http://127.0.0.1:9876
```

## Development

See `AGENTS.md` for the full development guide.
