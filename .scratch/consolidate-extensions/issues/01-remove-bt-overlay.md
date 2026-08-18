# 01 — Remove my-bt overlay

**What to build:** Remove the `build:overlay` build step and all overlay-related code from `my-bt`. The extension should only handle sound playback via event hooks and the `/bt` command.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Remove `build:overlay` script and `scripts/build-overlay.ts`
- [x] Remove `scripts/mac-overlay.ts`
- [x] Remove `build:overlay` from `package.json` build script (keep only `bun build ...`)
- [x] Remove overlay-related code from `player.ts` (`playOverlay` function and its call sites)
- [x] Remove overlay-related code from `index.ts` (overlay calls in event handlers and command handler)
- [x] All existing tests pass
- [x] Build succeeds (single `bun build` step, no overlay artifact)
