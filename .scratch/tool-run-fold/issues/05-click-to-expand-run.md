# 05 — 点击 Run Summary Row 展开这一次 run

**What to build:** 用户点击 Run Summary Row 时，只展开这一次 Tool Run 的工具行（展开后每行沿用现有输出规则），其他 run 不受影响。`ctrl+o` 仍是全局总开关；Tool Run 进行中点击摘要行不产生任何效果；已经展开的 run 不因为全局收起而回到折叠。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 点击 Run Summary Row 展开该 Tool Run 的全部工具行；再次点击回到折叠
- [ ] 展开只作用于被点击的 run，其他 run 保持折叠
- [ ] Tool Run 进行中点击摘要行无效果；`ctrl+o` 的全局展开不受影响
- [ ] 已展开的 run 在全局收起后保持展开（单向）
- [ ] 摘要行点击不与 Pi 的行级展开点击互相干扰（不发生双重切换）
- [ ] 测试覆盖：点击与全局开关解耦、单向性、运行中无效果
- [ ] `bun run verify` 通过；真实 TUI 手动确认点击展开与全局开关共存
