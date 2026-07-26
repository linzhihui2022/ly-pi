# 01 — Remove my-bt overlay

**What to build:** Remove the `build:overlay` build step and all overlay-related code from `my-bt`. The extension should only handle sound playback via event hooks and the `/bt` command.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Remove `build:overlay` script and `scripts/build-overlay.ts`
- [ ] Remove `scripts/mac-overlay.ts`
- [ ] Remove `build:overlay` from `package.json` build script (keep only `bun build ...`)
- [ ] Remove overlay-related code from `player.ts` (`playOverlay` function and its call sites)
- [ ] Remove overlay-related code from `index.ts` (overlay calls in event handlers and command handler)
- [ ] All existing tests pass
- [ ] Build succeeds (single `bun build` step, no overlay artifact)
