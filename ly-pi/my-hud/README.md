# my-hud

Custom single-line HUD statusline for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

Replaces the built-in footer with a compact, always-on status bar showing:

| Field | Icon | Description |
|-------|------|-------------|
| Project |  | Current directory basename |
| Model |  | Active LLM model ID |
| Branch |  | Git branch (hidden if not in a repo), PR number linked when found |
| Git Status | — | Dirty counts in starship style: `++staged`, `~unstaged`, `?untracked`, `*stashed`, `!!conflicted`, `⇡ahead⇣behind` |
| Context |  /  /  | Context window usage % with color-coded thresholds |
| Input |  | Cumulative input tokens this session |
| Output |  | Cumulative output tokens this session |
| Cache Read |  | Cumulative cache-read tokens this session |
| Cost |  | Estimated cost in CNY (USD × 7) |
| Permission |  | Judge allowed/denied counts and judge cost in CNY |
| Hide Thinking |  | Pi's "Hide thinking" state — eye = visible, eye-slash = hidden (reads `hideThinkingBlock` from settings.json) |

## Context Thresholds

The context icon and color adapt based on window size:

- **Small window (≤ 500k tokens):**
  - ≤ 70% — accent (mauve)
  - 71-90% — warning (yellow)
  - > 90% — error (red)

- **Large window (> 500k tokens):**
  - ≤ 20% — accent (mauve)
  - 21-50% — warning (yellow)
  - > 50% — error (red)

## Configuration

Optional `my-hud.json` inside the extension directory (reloaded via `/reload`):

```json
{
  "modelShortNames": { "openai-codex/gpt-5.6-terra": "terra" },
  "hiddenFields": ["cost", "cacheRate"]
}
```

- `modelShortNames` — map full model IDs to short display names (overrides builtins)
- `hiddenFields` — hide status line fields; valid keys: `project`, `model`, `branch`, `gitStatus`, `context`, `input`, `output`, `cacheRead`, `cost`, `cacheRate`, `permission`, `hideThinking`

Missing or invalid config falls back to defaults silently.

## Install

```bash
bun install
```

## Test

```bash
npx vitest run
```

## Deploy

Copy `index.ts` into your pi extensions directory (usually `~/.pi/agent/extensions/my-hud/`) and reload pi with `/reload`.

## Requirements

- A [Nerd Font](https://www.nerdfonts.com/) for icon glyphs
- pi coding agent ≥ v0.78.0
