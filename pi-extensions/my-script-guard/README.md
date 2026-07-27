# my-script-guard

Hard-blocks **Inline Scripts** and **File Write Bypasses** (see
`CONTEXT.md`): interpreter code passed to bash via `-c`/`-e`/`-r` flags or
heredoc/herestring (python/node/ruby/perl/php), and shell heredocs/redirects
used to simulate the write/edit tools.

## Rules

| Pattern | Verdict |
| --- | --- |
| `python3 -c "<code>"` where code > 80 chars or contains a newline | block |
| `python3 <<EOF ... EOF` (heredoc/herestring as program source) | always block |
| `python3 script.py`, `node tool.js` | allow |
| `python3 script.py <<EOF` (heredoc as data, not program) | allow |
| `cat <<EOF > file`, `cat > file <<EOF`, `cat <<EOF >> file` | always block |
| `tee file <<EOF`, `tee -a file <<EOF`, `cat <<EOF \| tee file` | always block |
| `echo/printf ... > file` where content > 80 chars or contains a newline | block |
| `echo "FOO=bar" >> .env` (short one-liner) | allow |
| `cat <<EOF \| jq .`, `git commit -F - <<EOF` (heredoc as pipe data) | allow |
| `cat a b > c`, `grep x log > out` (no inline content) | allow |

The block `reason` guides the agent to prefer dedicated tools
(read/write/edit/grep) and, when a script is genuinely required, to write it
to a file and run `python3 <file>`.

## Urgent Escalation

There is deliberately **no config switch**. After 3 blocked attempts in a
session, the 4th and later attempts show a confirmation dialog (with a script
preview) so the user can allow or deny on the spot. Both rule categories
share one counter — escalation measures persistent tool-bypass attempts, not
any single rule. Sessions without a UI (subagents) keep hard-blocking. See
`docs/adr/0001-my-script-guard-escalation.md` and
`docs/adr/0002-block-file-write-bypass.md`.

## Development

```bash
bun test        # or: npx vitest run --coverage
bun run build
bun run deploy
```
