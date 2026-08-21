# 03 — 迁移会话命名与 HUD

**What to build:** 作为 ly-pi 使用者，会话自动命名通过 fast Model Role 请求模型并保持原有的失败跳过行为；HUD 显示由候选的 Model Label 决定，未知或 Pi 恢复后的主模型则如实显示其原始标识。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** resolved

- [x] 自动会话命名只依赖 fast Model Role，不再直接引用具体 provider/model。
- [x] 标题模型的基础设施故障按 fast 策略处理，最终失败仍保持未命名且不阻塞首个回答。
- [x] HUD 从有效候选读取 Model Label，不再维护独立的内建短名表。
- [x] HUD 对未在有效候选中的实际模型保留可识别的原始显示值。
- [x] 测试从具体模型字符串转为验证角色选择、成功、失败和显示行为。

## Comments

- 2026-08-21：风险评定为 Medium（用户可见的跨模块模型显示迁移）。用户在结构化选择中选定本票，批准按既定验收范围实施。测试 seam：`requestSessionTitle()` 的 fast Role 执行、Registry 的候选标签解析、以及 `Bar` 的标签/原始标识渲染。
- 2026-08-21：已完成两轴代码审查，未发现可操作问题；`bun run verify` 通过（62 test files / 902 tests）。
