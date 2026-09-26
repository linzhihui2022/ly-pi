# 05 — Finalize: remove turbo, root scripts, settings.json, old artifacts

**What to build:** Clean up the old multi-package infrastructure. Remove `pi-extensions/` directory and turbo. Update root `package.json`. Create `scripts/deploy-all.ts` that orchestrates the full deployment pipeline. Update `settings/settings.json` to remove the now-redundant extensions array.

**Blocked by:** 04 — Move remaining extensions

**Status:** resolved

- [x] Delete `pi-extensions/` directory (all original extension packages are now in `ly-pi/`)
- [x] Remove `turbo` from root `devDependencies`
- [x] Remove `pi-extensions/*` from root `workspaces` array; add `ly-pi`
- [x] Update root `deploy` script from `turbo run deploy` to `bun run scripts/deploy-all.ts`
- [x] Create `scripts/deploy-all.ts`: orchestrates `ly-pi` build → test → deploy, then settings deploy, then skills deploy, then themes deploy
- [x] Update `settings/settings.json`: remove the `extensions` array (keep only `subagents`)
- [x] Update `settings/scripts/deploy.ts`: the `extensions` array merge logic should handle the case where the key is absent
- [x] `bun run deploy` completes successfully end-to-end
- [x] Verify `~/.pi/agent/settings.json` no longer contains the `extensions` array
- [x] Verify `~/.pi/agent/extensions/ly-pi/index.js` exists and is the only custom extension deployed
