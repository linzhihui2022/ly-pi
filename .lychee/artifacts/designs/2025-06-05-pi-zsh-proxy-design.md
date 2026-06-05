# Pi Zsh Proxy Extension - Design

## Problem

Pi's `bash` tool runs in non-interactive `bash -c` mode, which does not load oh-my-zsh or expand zsh aliases. Users who rely on oh-my-zsh aliases (e.g., `gst` for `git status`) cannot use them inside Pi.

Current workaround (`aliases.sh` + `shellCommandPrefix`) requires manual maintenance of alias mappings and quickly becomes outdated as the zsh configuration evolves.

## Goal

A Pi Extension that lets users execute zsh commands (with oh-my-zsh aliases and functions) using a `$` prefix, without manual alias synchronization.

## Architecture

```
User types "$gst" or "$$gst"
         ↓
    input event: detect $ prefix
         ↓
    Transform to "!gst" or "!!gst"
         ↓
    Pi processes ! prefix → user_bash event
         ↓
    user_bash event: intercept with zsh proxy
         ↓
    exec: zsh -ic "gst" (preserves cwd)
         ↓
    Return stdout/stderr/exitCode
```

## Components

### 1. Input Transform (`input` event handler)

- Listens for `input` event on every user message
- Checks if `event.text.trim()` starts with `$` or `$$
- If yes, transforms:
  - `$<cmd>` → `!<cmd>` (result sent to LLM)
  - `$$<cmd>` → `!!<cmd>` (result displayed only)
- The command part is trimmed (e.g., `$ gst` → `!gst`)
- Returns `{ action: "transform", text: ... }`

### 2. Zsh Bash Operations (`user_bash` event handler)

- Listens for `user_bash` event
- Uses `createLocalBashOperations()` as base
- Wraps `exec()` to prefix commands with `zsh -ic`
- Preserves original `cwd`

```typescript
const local = createLocalBashOperations();
return {
  operations: {
    exec(command, cwd, options) {
      return local.exec(`zsh -ic ${JSON.stringify(command)}`, cwd, options);
    }
  }
};
```

### 3. Fallback Logic

- If `zsh` command is not found in PATH:
  - Fall back to native bash execution
  - Send `ctx.ui.notify()` warning: "zsh not found, falling back to bash"
- If `zsh -ic` exits with error: transparently pass through exit code and stderr

## Configuration

Optional `settings.json` under extension scope (future-proofing):

```json
{
  "zshPath": "/opt/homebrew/bin/zsh"
}
```

Default: `"zsh"` (resolved from PATH)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| zsh not in PATH | Fallback to bash, notify user |
| zsh exits non-zero | Pass through exit code and stderr as-is |
| Command not found in zsh | zsh reports `command not found`, exit code 127 |
| Empty command (`$` or `$$`) | Transform to `!` / `!!` (bash will report "usage: ...") |

## Testing Strategy

TDD per project convention:

1. Mock `createLocalBashOperations()` to avoid real zsh invocations
2. Test `input` event transform logic:
   - `$gst` → `!gst`
   - `$$gst` → `!!gst`
   - `$ gst` → `!gst` (trimmed)
   - `normal text` → unchanged
3. Test `user_bash` command wrapping:
   - `gst` → `zsh -ic "gst"`
   - `git status` → `zsh -ic "git status"`
4. Test zsh not found fallback
5. Coverage target: 100% (branches/functions/lines/statements)

## Files

```
pi-extensions/pi-zsh-proxy/
├── index.ts          # Main extension (input + user_bash handlers)
├── index.test.ts     # Unit tests
├── vitest.config.ts  # Test config (copied from my-bt pattern)
└── types.ts          # Shared types (if needed)
```

## Dependencies

- `@earendil-works/pi-coding-agent` (for ExtensionAPI, events, createLocalBashOperations)
- No external npm dependencies

## Trade-offs

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| All commands via zsh | Yes | Simpler than alias scanning + whitelist; acceptable overhead for `!` commands |
| Only `!` prefix (not LLM tool calls) | Yes | Scope is user convenience, not changing LLM behavior |
| No alias caching / reload needed | Yes | Direct zsh execution always reflects current zshrc state |
| `$$` prefix for silent mode | Yes | Mirrors Pi's `!!` convention; consistent mental model |

## Future Extensions (out of scope)

- Cache zsh aliases at startup to provide completions for `$` commands
- Support `zsh -ilc` (login shell) for users whose aliases depend on login shell setup
- Support custom shell (fish, bash with dotfiles, etc.)
