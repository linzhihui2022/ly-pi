# 06 — 恢复历史会话时重建 Tool Run

**What to build:** `/resume` 打开旧会话时，历史里的 Tool Run 按同一规则折叠成一行 Run Summary Row；展开后回看与在线一致。展开状态不持久化，恢复后的 run 一律回到默认折叠。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 恢复会话时，从会话条目中的工具标识顺序重建 Tool Run 边界
- [ ] 历史 Tool Run 渲染为 Run Summary Row；计数与耗时依据会话条目可获得的信息计算，信息缺失时安全退化
- [ ] 恢复后的 run 一律默认折叠，展开可回看；不写 session、不改模型上下文
- [ ] 会话条目夹具覆盖：单 run、多 run、run 内多个 turn、无工具调用的回答、被中断的 run
- [ ] 重建失败或条目异常时安全降级为不折叠，不影响会话加载
- [ ] `bun run verify` 通过；真实 TUI 手动确认恢复一个旧会话后的折叠与展开
