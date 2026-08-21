# 06 — 迁移安全审计与权限 self-test

**What to build:** 作为 ly-pi 使用者，Advocate、Prosecutor 和 Chief 使用受仓库保护的 security-audit 策略；权限对抗 self-test 在 Pi 扩展上下文中复用 security-judge，而不再自行配置 Provider 或凭据。安全分析失败时不会修改 JUDGE.md。

**Blocked by:** 05 — 将 Judge 迁入 security-judge

**Status:** resolved

- [x] 实施前为这一 High-risk 的 my-permission 迁移补充并获得 guardrail 批准。
- [x] 所有安全审计和合并分析通过 security-audit 角色执行，不再读取独立 professor 模型或 thinking 配置。
- [x] 权限 self-test 经 Pi 的 Model Registry 和 security-judge 运行，保留可测试的纯评估逻辑，不直接注册特定 Provider。
- [x] 安全审计的模型调用失败或协议错误时返回明确错误，且不会写入或修改 JUDGE.md。
- [x] 成功路径的交互确认、报告、成本记录和规则建议行为保持可验证。
- [x] 测试使用假的 Registry 覆盖安全候选约束、失败闭合与无直接 Provider 依赖。

## Comments

- 2026-08-21：风险评定为 High（变更 `my-permission` 的安全审计模型路由及 JUDGE.md 写入前路径）。用户明确批准限定实施：修改仓库源码、测试和本票据，并运行 `bun run verify`；不发真实模型请求、不部署 `~/.pi`、不执行 `/reload`。用户选定显式 `/permission-self-test` 命令；旧 `judgeModel` / `professorModel` 配置字段删除留给 07。
- 2026-08-21：导入旧 `self-test.ts` 的测试曾触发其模块级 `main()`；命令已结束，未部署、未 reload、未写入 JUDGE.md，且无法从输出确认是否有外部请求。用户批准立即移除导入副作用；后续 self-test 测试仅使用假的 Model Registry。
- 2026-08-21：验收证据：`bun run verify` 已通过（63 test files / 901 tests）；未部署 `~/.pi`，未执行 `/reload`。
- 2026-08-21：两轴审查完成：Spec 无发现；Standards 的验收证据缺口已补记。安全审计、JUDGE.md 合并、self-test 命令及其失败闭合均由假的 Model Registry 测试覆盖。
