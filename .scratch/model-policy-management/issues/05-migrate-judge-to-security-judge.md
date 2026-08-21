# 05 — 将 Judge 迁入 security-judge

**What to build:** 作为 ly-pi 使用者，权限 Judge 仅使用仓库批准的 security-judge 候选，并在候选无法完成基础设施调用或返回无效协议时保持失败闭合、要求用户确认，而不会回退到父会话或本地任意模型。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** ready-for-agent

- [ ] 实施前按 agentic delivery guardrails 为 High-risk 的 my-permission 改动留下风险记录并获得明确批准。
- [ ] Judge 通过 Model Runner 请求 security-judge，不再从权限配置读取具体模型标识。
- [ ] 安全候选只来自仓库批准的链，本地覆写无法改变它们。
- [ ] 基础设施失败可按固定安全候选顺序尝试；畸形输出或业务协议错误立即失败闭合。
- [ ] 权限规则、确认 UI、统计和成本行为在成功路径保持原有可观察语义。
- [ ] 测试覆盖安全候选、候选耗尽、协议错误、用户确认与禁止回退父会话。
