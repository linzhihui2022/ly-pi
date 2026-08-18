# 02 — Create ly-pi package skeleton + move web-preview

**What to build:** Create the `ly-pi/` package at repo root with unified build, test, and deploy infrastructure. Move `web-preview` into it as an internal utility module. The package has a placeholder `index.ts` that exports an empty registration function.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Create `ly-pi/package.json` with `name: "ly-pi"`, unified dependencies from all current extensions (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `typebox@^1.1.39`, `open`, `marked`, `highlight.js`, `marked-highlight`, `github-markdown-css`), devDependencies (`vitest`, `@types/bun`, `@types/node`)
- [x] Create `ly-pi/tsconfig.json`
- [x] Create `ly-pi/vitest.config.ts` with 100% coverage thresholds (branches/functions/lines/statements), excluding `types.ts` and `index.ts`
- [x] Create `ly-pi/scripts/deploy.ts` that copies `dist/index.js` to `~/.pi/agent/extensions/ly-pi/`
- [x] Move `web-preview/` from `pi-extensions/web-preview/` to `ly-pi/web-preview/`
- [x] Update `my-permission` and `my-html` imports from `"web-preview"` to relative path `"../web-preview/index"` (they still live in `pi-extensions/` for now)
- [x] Create placeholder `ly-pi/index.ts` with `export default function(pi: ExtensionAPI) {}`
- [x] `bun run --cwd ly-pi build` succeeds
- [x] `bun run --cwd ly-pi test` passes (web-preview tests)
