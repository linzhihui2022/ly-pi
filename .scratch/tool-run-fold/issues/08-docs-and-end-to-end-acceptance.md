# 08 — 文档收口与端到端验收

**What to build:** README 描述折叠行为，并对全部场景一起工作的组合做一次端到端回归，确认这一版可以交付。

**Blocked by:** 03 — 失败也收起 + 运行失败提示；04 — 中断与报错终止的收起与提示；05 — 点击 Run Summary Row 展开这一次 run；06 — 恢复历史会话时重建 Tool Run；07 — 配置开关 foldToolRuns

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] README 的 `my-tool-display` 条目描述折叠行为：Tool Run 折叠为一行摘要、完成即收、`ctrl+o` 总开关、点击摘要行展开、失败与中断提示
- [ ] 真实 TUI 端到端回归：完成即收、Live Tool Row、点击展开、`ctrl+o` 全局展开、失败提示、中断提示、恢复旧会话、关闭配置、窄终端宽度、连续多次 `/reload`
- [ ] `bun run deploy` + `/reload` 后无重复注册、无重复摘要行、无残留计时
- [ ] `bun run verify` 通过
