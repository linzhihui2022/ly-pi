# 03 — 迁移会话命名与 HUD

**What to build:** 作为 ly-pi 使用者，会话自动命名通过 fast Model Role 请求模型并保持原有的失败跳过行为；HUD 显示由候选的 Model Label 决定，未知或 Pi 恢复后的主模型则如实显示其原始标识。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** ready-for-agent

- [ ] 自动会话命名只依赖 fast Model Role，不再直接引用具体 provider/model。
- [ ] 标题模型的基础设施故障按 fast 策略处理，最终失败仍保持未命名且不阻塞首个回答。
- [ ] HUD 从有效候选读取 Model Label，不再维护独立的内建短名表。
- [ ] HUD 对未在有效候选中的实际模型保留可识别的原始显示值。
- [ ] 测试从具体模型字符串转为验证角色选择、成功、失败和显示行为。
