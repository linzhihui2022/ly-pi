# 03 — Move guard extensions + build unified entry point

**What to build:** Move `my-cd-guard`, `my-script-guard`, and `my-permission` into `ly-pi/`. Wire them into the unified `ly-pi/index.ts` entry point in the correct registration order. Verify the full build → test → deploy pipeline works end-to-end.

**Blocked by:** 02 — Create ly-pi package skeleton + move web-preview

**Status:** ready-for-agent

- [ ] Move `my-cd-guard/` from `pi-extensions/` to `ly-pi/my-cd-guard/` (all source files and tests)
- [ ] Move `my-script-guard/` from `pi-extensions/` to `ly-pi/my-script-guard/`
- [ ] Move `my-permission/` from `pi-extensions/` to `ly-pi/my-permission/`
- [ ] Update `my-permission` imports: change `from "web-preview"` to `from "../web-preview/index"` and `from "@sinclair/typebox"` to `from "typebox"`
- [ ] Update `ly-pi/index.ts` to import and call registration functions in order: `myCdGuard`, `myScriptGuard`, `myPermission`
- [ ] All moved tests pass under unified vitest (`bun run --cwd ly-pi test`)
- [ ] Build succeeds (`bun run --cwd ly-pi build`)
- [ ] Deploy succeeds (`bun run --cwd ly-pi deploy`), `~/.pi/agent/extensions/ly-pi/index.js` exists
