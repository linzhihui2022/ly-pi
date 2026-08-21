# 06 — 迁移安全审计与权限 self-test

**What to build:** 作为 ly-pi 使用者，Advocate、Prosecutor 和 Chief 使用受仓库保护的 security-audit 策略；权限对抗 self-test 在 Pi 扩展上下文中复用 security-judge，而不再自行配置 Provider 或凭据。安全分析失败时不会修改 JUDGE.md。

**Blocked by:** 05 — 将 Judge 迁入 security-judge

**Status:** ready-for-agent

- [ ] 实施前为这一 High-risk 的 my-permission 迁移补充并获得 guardrail 批准。
- [ ] 所有安全审计和合并分析通过 security-audit 角色执行，不再读取独立 professor 模型或 thinking 配置。
- [ ] 权限 self-test 经 Pi 的 Model Registry 和 security-judge 运行，保留可测试的纯评估逻辑，不直接注册特定 Provider。
- [ ] 安全审计的模型调用失败或协议错误时返回明确错误，且不会写入或修改 JUDGE.md。
- [ ] 成功路径的交互确认、报告、成本记录和规则建议行为保持可验证。
- [ ] 测试使用假的 Registry 覆盖安全候选约束、失败闭合与无直接 Provider 依赖。
