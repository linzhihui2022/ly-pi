# my-script-guard

Hard-blocks **Inline Scripts** (see `CONTEXT.md`): interpreter code passed to
bash via `-c`/`-e`/`-r` flags or heredoc/herestring, covering
python/node/ruby/perl/php.

## Rules

| Pattern | Verdict |
| --- | --- |
| `python3 -c "<code>"` where code > 80 chars or contains a newline | block |
| `python3 <<EOF ... EOF` (heredoc/herestring as program source) | always block |
| `python3 script.py`, `node tool.js` | allow |
| `python3 script.py <<EOF` (heredoc as data, not program) | allow |

The block `reason` guides the agent to prefer dedicated tools
(read/write/edit/grep) and, when a script is genuinely required, to write it
to a file and run `python3 <file>`.

## Urgent Escalation

There is deliberately **no config switch**. After 3 blocked attempts in a
session, the 4th and later attempts show a confirmation dialog (with a script
preview) so the user can allow or deny on the spot. Sessions without a UI
(subagents) keep hard-blocking. See
`docs/adr/0001-my-script-guard-escalation.md`.

## Development

```bash
bun test        # or: npx vitest run --coverage
bun run build
bun run deploy
```
