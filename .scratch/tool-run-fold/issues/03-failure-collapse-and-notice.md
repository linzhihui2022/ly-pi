# 03 — 失败也收起 + 运行失败提示

**What to build:** 失败的工具行不再常驻。Tool Run 期间，失败行的收起方式与其他行一致；但 Tool Run 结束时，该 Run 的最后一条 Tool Row 变成一行 Run Failure Notice（`⚠ 1 failed · bash: bun test`），Run Summary Row 同时带 `⚠ N failed` 计数。用户既得到安静的版面，又不会漏掉失败。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 工具失败不再阻止收起：失败行与成功行一样在结束时隐藏
- [ ] Tool Run 结束时，若期间发生过工具失败，最后一条 Tool Row 常驻显示失败次数与失败工具的简短定位
- [ ] Run Summary Row 在有失败时显示 `⚠ N failed` 计数
- [ ] 无失败的 Tool Run 不产生失败提示行
- [ ] 折叠核心单测覆盖失败计数、提示行的触发条件与承载位置、多次失败聚合；渲染契约测试覆盖提示行文案
- [ ] `bun run verify` 通过；真实 TUI 手动确认一次含失败的 run 收起后仍能看到失败定位并可展开回看
