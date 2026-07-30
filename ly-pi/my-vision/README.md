# my-vision

Injects the image-handling rule that matches the **active model's** vision
capability, evaluated per turn on `before_agent_start` via
`ctx.model.input`.

## Rules

| Active model | Injected system-prompt suffix |
| --- | --- |
| `input` includes `"image"` (e.g. `kimi-coding/k3-256k`) | **Direct read**: analyze images with the `read` tool, do not delegate |
| `input` is `["text"]` or model unknown (e.g. `deepseek-v4-pro`) | **Delegate**: all image analysis goes to the `image-reader` subagent (incl. temp-dir copy/cleanup rules) |

Replaces the static `## Vision Delegation` block that used to live in
`append-system.md` (it forced delegation even on vision-capable models).
Model switches mid-session take effect on the next turn.

## Development

```bash
bun test        # or: npx vitest run --coverage
bun run build
bun run deploy
```
