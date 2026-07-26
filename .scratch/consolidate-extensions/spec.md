# Consolidate Pi Extensions to Single Entry Point

**Status:** ready-for-agent

## Problem Statement

The current pi extension setup has 7 independent extensions plus a shared utility library (`web-preview`) spread across 8 workspace packages under `pi-extensions/`. Each has its own `package.json`, build script, deploy script, and test setup. This creates maintenance overhead: a change touching multiple extensions (e.g., updating a shared dependency version) requires touching multiple package files. The `turbo` orchestration for cross-package build dependencies is overkill for what are essentially modules of a single concern — the user's custom pi runtime. Individual deploy scripts scatter files across `~/.pi/agent/extensions/`, and the `settings.json` `extensions` array redundantly lists some extensions that are already auto-discovered.

## Solution

Merge all 7 extensions and the `web-preview` utility library into a single `ly-pi` package with one entry point. The unified `index.ts` imports and registers all sub-modules in explicit order. Build produces a single `dist/index.js` deployed to `~/.pi/agent/extensions/ly-pi/`. Pi auto-discovers and loads it. Drop turbo in favor of a single `scripts/deploy-all.ts` that orchestrates the entire deployment.

## User Stories

1. As a pi user, I want all my custom extensions managed in one place, so that I don't need to think about which extension is where.
2. As a maintainer, I want a single `bun run deploy` to deploy everything, so that I can iterate faster without running multiple turbo tasks.
3. As a maintainer, I want a single `package.json` for all custom extensions, so that updating shared dependencies is one change instead of seven.
4. As a maintainer, I want the extension registration order to be explicit and documented, so that inter-extension dependencies (like my-hud reading my-permission stats) are guaranteed to work correctly.
5. As a maintainer, I want to keep existing test coverage intact, so that the merge doesn't regress any behavior.
6. As a maintainer, I want the old extension directories cleaned up from `~/.pi/agent/extensions/`, so that there is no confusion about which extensions are active.
7. As a maintainer, I want the `web-preview` library to be an internal module, so that it doesn't need to be a separate workspace package with its own build.
8. As a maintainer, I want the `settings.json` `extensions` array to be removed, so that it no longer redundantly lists auto-discovered extensions.
9. As a maintainer, I want a unified vitest configuration, so that all sub-module tests can run together or individually with consistent coverage thresholds.
10. As a maintainer, I want the `my-bt` overlay feature removed, so that the extension only handles sound playback and the build is simpler.
11. As a maintainer, I want the `typebox` dependency unified to a single version, so that there are no duplicate or conflicting typebox packages.

## Implementation Decisions

### Package consolidation

All 7 extensions (`my-cd-guard`, `my-script-guard`, `my-permission`, `my-back`, `my-html`, `my-bt`, `my-hud`) and the `web-preview` utility library are merged into a single `ly-pi` package at the repository root. Each sub-module retains its original directory name for git history preservation.

### Single entry point

`ly-pi/index.ts` exports a single `default function(pi: ExtensionAPI)` that imports and calls each sub-module's registration function. Only the registration function is exported; internal APIs are imported directly by path in tests.

### Registration order

Sub-modules are registered in this explicit order to satisfy dependencies:

1. `my-cd-guard` — modifies bash commands
2. `my-script-guard` — intercepts dangerous scripts
3. `my-permission` — permission gating
4. `my-back` — background tasks
5. `my-html` — HTML preview
6. `my-bt` — sound effects
7. `my-hud` — UI display (reads my-permission judge stats)

### Build

Single `bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'`.

### Deployment

`scripts/deploy-all.ts` orchestrates: ly-pi build → test → deploy, settings deploy, skills deploy, themes deploy. The ly-pi deploy copies `dist/index.js` and static assets (JSON configs, sounds) to `~/.pi/agent/extensions/ly-pi/`.

### Static assets

Configuration files (`my-bt.json`, `my-hud.json`, `my-back.json`) and the `sounds/` directory are placed flat at the `ly-pi/` package root. Sub-module code resolves them relative to the package root.

### Dependency unification

`typebox` is unified to `typebox@^1.1.39`. `my-permission` previously used `@sinclair/typebox@^0.34.52`; its imports are updated.

### my-bt overlay removal

The `build:overlay` step and all overlay-related code in `my-bt` is removed. The extension only handles sound playback via event hooks.

### Turbo removal

`turbo` is removed from devDependencies. Root `package.json` deploy script becomes `bun run scripts/deploy-all.ts`. The `pi-extensions/*` workspace glob is removed; `ly-pi` is added.

### settings.json update

The `extensions` array is removed from `settings/settings.json`. Pi auto-discovers `ly-pi` from `~/.pi/agent/extensions/ly-pi/index.js`. The `settings/` workspace remains independent for third-party extension configuration.

### Workspace structure

The `pi-extensions/` directory is removed. `ly-pi/` lives at repository root alongside `settings/`, `tools/`, `pi-skills/`, `pi-themes/`.

### Old extension cleanup

Manual cleanup of `~/.pi/agent/extensions/my-*` directories is done by the user after deployment. Not automated.

## Testing Decisions

### What makes a good test

Tests verify external behavior through the `ExtensionAPI` seam — simulating pi lifecycle events and asserting handler side effects. Internal implementation details are not tested.

### Modules tested

Each sub-module retains its existing `index.test.ts` (and any supplementary test files like `render.test.ts`). A new unified `ly-pi/index.test.ts` verifies the entry point calls all 7 registration functions in order.

### Test infrastructure

Unified `vitest.config.ts` at `ly-pi/` root with coverage thresholds: branches/functions/lines/statements all 100%. Test files excluded from coverage: `types.ts`, `index.ts` (integration-level), and any adapter shells. Individual sub-modules can be targeted via vitest's `--project` or file path filtering.

### Prior art

The existing per-extension test files serve as prior art. They test by creating a mock `ExtensionAPI`, calling `export default function(pi)`, and asserting behavior on event triggers.

## Out of Scope

- Changing extension behavior or features beyond my-bt overlay removal
- Refactoring sub-module internals (interfaces, state management, etc.)
- Adding new extensions
- Auto-cleaning old extension directories from `~/.pi/agent/extensions/`
- Changing the pi auto-discovery mechanism
- The `settings/` workspace (remains independent)

## Further Notes

- The `web-preview` module is not an extension (no `export default function`); it becomes a pure internal utility under `ly-pi/web-preview/`.
- After deployment, the user should run `/reload` in pi or restart pi to pick up the new unified extension.
