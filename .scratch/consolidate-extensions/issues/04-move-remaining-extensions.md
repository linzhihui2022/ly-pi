# 04 — Move remaining extensions

**What to build:** Move `my-back`, `my-html`, `my-bt`, and `my-hud` into `ly-pi/`. Complete the `index.ts` with all 7 extensions registered in order. Handle static assets (JSON configs, sounds). All extensions are functional from the single entry point.

**Blocked by:** 03 — Move guard extensions + build unified entry point

**Status:** ready-for-agent

- [ ] Move `my-back/` from `pi-extensions/` to `ly-pi/my-back/`
- [ ] Move `my-html/` from `pi-extensions/` to `ly-pi/my-html/`; update `web-preview` import to `"../web-preview/index"`
- [ ] Move `my-bt/` from `pi-extensions/` to `ly-pi/my-bt/`
- [ ] Move `my-hud/` from `pi-extensions/` to `ly-pi/my-hud/`
- [ ] Update typebox import in `my-back`: ensure it uses `typebox` (not `@sinclair/typebox`)
- [ ] Copy static assets flat to `ly-pi/` root: `my-bt.json`, `my-hud.json`, `my-back.json`, `sounds/`
- [ ] Update sub-module config-loading code to resolve paths relative to the new `ly-pi/` package root (not individual extension dirs)
- [ ] Complete `ly-pi/index.ts` with all 7 registration calls in order: cd-guard → script-guard → permission → back → html → bt → hud
- [ ] Update deploy script to also copy static assets to `~/.pi/agent/extensions/ly-pi/`
- [ ] All tests pass under unified vitest
- [ ] Build succeeds
- [ ] Deploy succeeds; all assets reach `~/.pi/agent/extensions/ly-pi/`
