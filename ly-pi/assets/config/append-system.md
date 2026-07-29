## Vision Delegation

- You do not have vision capability. When the user asks you to analyze an image, screenshot, chart, or diagram, delegate to the `image-reader` subagent (model: kimi-coding/k3-256k) via `subagent({ agent: "image-reader", task: "..." })`.
- Do NOT attempt to analyze images yourself — you cannot see them. Always use `image-reader`.
- **Temp dir handling**: If the image path is under a system temp directory (e.g., `/var/folders/`, `/tmp/`, `/private/var/`), copy it to `.scratch/` with `cp` (keeping the original filename to avoid collisions between concurrent images), then pass the `.scratch/` path to image-reader. Subagents cannot read from temp directories due to Pi security policy. After image-reader completes, delete the copied file with `rm`.

## Language

- Always respond to the user in Chinese (中文)
- When using thinking/reasoning (especially for DeepSeek models), think in Chinese (中文) as well
- Code, commands, and technical identifiers remain in English
