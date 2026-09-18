# 07 — 配置开关 foldToolRuns

**What to build:** 用户可以在配置里关掉折叠，回到逐条工具行呈现（即 01 之后的形态）：没有摘要行、没有提示行、点击展开不生效。开关默认启用，改动经 `/reload` 生效。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 配置新增布尔字段 `foldToolRuns`，默认启用
- [ ] 字段为 false 时完全不产生折叠行为（摘要行、失败/中断提示行、点击展开均不生效），呈现与 01 之后一致
- [ ] 字段缺失、类型错误或非法值回退默认；一份坏配置不阻止启动也不改变呈现
- [ ] `ly-pi/assets/config/my-tool-display.json` 样例与 README 配置表同步说明新字段
- [ ] 配置测试覆盖：字段存在、缺失、非法、关闭折叠
- [ ] `bun run verify` 通过；部署并 `/reload` 后手动确认关闭开关回到逐条呈现、重新启用后折叠恢复
