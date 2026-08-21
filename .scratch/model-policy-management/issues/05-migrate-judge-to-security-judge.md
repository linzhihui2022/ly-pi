# 05 — 将 Judge 迁入 security-judge

**What to build:** 作为 ly-pi 使用者，权限 Judge 仅使用仓库批准的 security-judge 候选，并在候选无法完成基础设施调用或返回无效协议时保持失败闭合、要求用户确认，而不会回退到父会话或本地任意模型。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** resolved

- [x] 实施前按 agentic delivery guardrails 为 High-risk 的 my-permission 改动留下风险记录并获得明确批准。
- [x] Judge 通过 Model Runner 请求 security-judge，不再从权限配置读取具体模型标识。
- [x] 安全候选只来自仓库批准的链，本地覆写无法改变它们。
- [x] 基础设施失败可按固定安全候选顺序尝试；畸形输出或业务协议错误立即失败闭合。
- [x] 权限规则、确认 UI、统计和成本行为在成功路径保持原有可观察语义。
- [x] 测试覆盖安全候选、候选耗尽、协议错误、用户确认与禁止回退父会话。

## Comments

- 2026-08-21：风险评定为 High（变更 `my-permission` 的 Judge 模型路由及失败闭合语义）。用户在本会话明确批准限定实施：仅修改仓库源码和测试以完成本票据，并运行 `bun run verify`；不得部署 `~/.pi` 或执行 `/reload`。
- 2026-08-21：审查项处置：`judgeModel` 已不被 `createJudge()` 或权限 `tool_call` 用于选模；它暂仅供 `self-test.ts` 生成攻击变种。移除其直接 Provider/配置路径属于 06 号票据的 self-test 迁移范围，用户确认不扩大本票范围。
- 2026-08-21：已补齐真实 security-judge 双候选的限流回退、候选耗尽和畸形协议不回退测试，以及失败后用户确认放行/记录 override 与父会话模型隔离测试。两轴代码审查无可操作问题；`bun run verify` 通过（62 test files / 907 tests）。未部署 `~/.pi`，未执行 reload。
