# Tool Call Rendering Extension Design

**Date:** 2026-06-06
**Status:** Approved

## Overview

A lightweight Pi extension (`my-tool-display`) that customizes rendering of built-in tool calls (read, grep, find, ls, bash, edit, write), inspired by `pi-tool-display` but built from scratch with a simpler architecture.

## Goals

- Compact display of tool call results by default
- Configurable output modes (hidden / summary / preview) per tool type
- Diff rendering for edit/write results
- Thinking label formatting and context sanitization
- Native user message box with markdown awareness
- MCP tool rendering support
- Adapter API for other extensions to consume

## Non-Goals

- Deferred tool ownership discovery (always re-register on `before_agent_start`)
- Pending diff preview during streaming arguments
- RTK compaction hints
- Capability detection (MCP/RTK settings always visible)
- Debug logging infrastructure

## Architecture

### File Structure

```
pi-extensions/my-tool-display/
├── index.ts              # Entrypoint, lifecycle, command registration
├── config.ts             # Config load/save, defaults, presets, normalization
├── config-modal.ts       # /tool-display interactive settings UI
├── tool-overrides.ts     # All built-in tool render overrides
├── diff-renderer.ts      # Edit/write diff rendering engine
├── thinking-label.ts     # Thinking block labeling and context sanitization
├── user-message-box.ts   # Native user message box (merged from 5 files)
├── adapter.ts            # Adapter API for other extensions
├── render-utils.ts       # Shared rendering helpers (path shorten, line counting, etc.)
└── my-tool-display.json  # Runtime configuration
```

### Dependencies

```
index.ts → config.ts
index.ts → tool-overrides.ts → render-utils.ts
index.ts → thinking-label.ts
index.ts → user-message-box.ts
index.ts → adapter.ts
config-modal.ts → config.ts
tool-overrides.ts → diff-renderer.ts
tool-overrides.ts → adapter.ts (API export)
```

### Key Simplifications vs pi-tool-display

| pi-tool-display | my-tool-display |
|---|---|
| 23+ source files | 9 source files |
| Deferred ownership discovery | Direct re-register on before_agent_start |
| Pending diff preview system | Not included |
| RTK compaction handling | Not included |
| Capability detection | Not included |
| 5 user-message-box files | Merged into 1 file |
| Disposable/debug-logger modules | Inline where needed |
| Line-width-safety module | Merge into render-utils |

## Read Tool Rendering

### renderCall

```
read src/tool-overrides.ts
read src/file.ts:120          (offset only)
read src/file.ts:120-200      (offset + limit)
```

Format: `**read** <path>[:<from>-<to>]`

### renderResult

Three output modes, configurable via `readOutputMode`:

| Mode | Default display | Expanded (Ctrl+O) |
|---|---|---|
| `hidden` | `↳ loaded N lines` | Full content |
| `summary` (default) | `↳ loaded N lines • Ctrl+O to expand` | Full content |
| `preview` | First `previewLines` lines + fold hint | Full content up to 4000 lines |

Edge cases:
- `isPartial`: show "reading..."
- `isError`: pass through error text in error color
- Empty content: "↳ (no output)"
- Expanded beyond 4000 lines: cap with warning

## Configuration System

### Config File

Path: `pi-extensions/my-tool-display/my-tool-display.json`

```json
{
  "readOutputMode": "summary",
  "searchOutputMode": "count",
  "bashOutputMode": "summary",
  "mcpOutputMode": "summary",
  "previewLines": 8,
  "diffViewMode": "auto",
  "diffCollapsedLines": 24,
  "thinkingLabelEnabled": true,
  "userMessageBoxEnabled": true
}
```

### Config Loading Flow

1. Try to read `my-tool-display.json` from extension directory
2. Parse and validate against defaults
3. Merge missing keys from defaults
4. On parse failure: use defaults, notify warning on `session_start`

### Presets

| Preset | readOutputMode | searchOutputMode | bashOutputMode | mcpOutputMode |
|---|---|---|---|---|
| `balanced` (default) | summary | count | summary | summary |
| `opencode` | hidden | hidden | opencode | hidden |
| `verbose` | preview | preview | preview | preview |

### Commands

- `/tool-display` — Open settings modal (interactive)
- `/tool-display show` — Display current config
- `/tool-display reset` — Reset to default preset
- `/tool-display preset <name>` — Apply named preset

## Lifecycle

```
extension loaded
  → load config (or use defaults)

session_start
  → notify config load errors if any

before_agent_start
  → refresh config
  → register tool overrides (pi.registerTool for each built-in tool)

session_shutdown (reason == "reload")
  → No manual cleanup needed; pi.registerTool registrations reload automatically
```

## Data Flow

### Tool Override Registration

For each built-in tool (read, grep, find, ls, bash, edit, write):

1. Create tool definition with `pi.registerTool()`
2. Set `renderCall` to custom formatter
3. Set `renderResult` to mode-aware renderer
4. Delegate `execute` to built-in tool implementation

### renderCall Flow

```
TUI calls → extract path/params from args → format as styled Text → return
```

### renderResult Flow

```
TUI calls → extract text content → split lines → compact output
  → branch by config output mode
    hidden:  return empty Text
    summary: return line count + expand hint
    preview: return first N lines + fold hint
  → return Text
```

## Error Handling

| Scenario | Behavior |
|---|---|
| config.json parse error | Use defaults, notify warning on session_start |
| config.json write failure | Apply in-memory, revert on next start |
| isError in result | Pass through as error-colored text |
| Empty result content | Show "↳ (no output)" |
| isPartial (streaming) | Show "reading...", bypass output mode |
| Unknown output mode value | Fallback to "hidden" mode |

## Testing Strategy

### Phase 1: Read Rendering

File: `tests/render-read.test.ts`

- **renderCall**: basic path, offset, offset+limit, empty path
- **renderResult (hidden)**: empty result
- **renderResult (summary)**: single line, multiple lines, expanded
- **renderResult (preview)**: under limit, over limit with fold hint
- **Edge cases**: isPartial, isError, empty content

### Future Phases

| Phase | Test File | Coverage |
|---|---|---|
| 2 | render-search.test.ts | grep/find/ls call + result |
| 3 | render-bash.test.ts | bash call + result |
| 4 | diff-renderer.test.ts | edit/write diff views |
| 5 | config.test.ts | load/save/validate/presets |

### Targets

- 100% branch / function / line / statement coverage
- Use Vitest (consistent with project)
- Mock TUI Text/Container as plain objects
- Exclude `index.ts` from coverage (integration entry)

## Implementation Plan

Build incrementally across 5 phases:

1. **Read rendering** — render-utils.ts + read override in tool-overrides.ts + index.ts + config.ts
2. **Search rendering** — grep/find/ls overrides
3. **Bash rendering** — bash override
4. **Diff rendering** — diff-renderer.ts + edit/write overrides
5. **Polish** — thinking-label, user-message-box, config-modal, adapter API

Each phase: write tests first (TDD), then implementation, verify 100% coverage.
