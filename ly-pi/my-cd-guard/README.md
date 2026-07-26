# my-cd-guard

Silently rewrites bash tool calls that begin with a **Redundant cd** (see
`CONTEXT.md`): a leading `cd <target> &&` / `cd <target> ;` whose target
resolves to the session working directory.

## Rules

| Pattern | Action |
| --- | --- |
| `cd <cwd> && git status` | rewrite to `git status`, notify user |
| `cd <cwd>` (whole command) | rewrite to `true`, notify user |
| `cd . && ls` / quoted target / trailing slash / symlink variants | rewrite |
| `cd /elsewhere && ls`, mid-command `cd <cwd>` | leave untouched |

Normalization covers quoting, trailing slashes, `.`/`./`, and `realpath`
symlink resolution (e.g. macOS `/tmp` → `/private/tmp`). Sessions without a
UI (subagents) rewrite silently.

## Development

```bash
bun test        # or: npx vitest run --coverage
bun run build
bun run deploy
```
