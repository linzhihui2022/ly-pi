# 01 — 在确认弹窗显示实际法官模型

**Status:** resolved

**What to build:** 将本次 `JudgeResult.modelUsed` 传给 `confirmToolCall`，并在确认弹窗中显示“法官模型：<provider>/<model>”。`modelUsed` 缺失时显示“未知”。不改变模型选择、风险规则或安全放行路径。

## Acceptance Criteria

- [ ] 有 `modelUsed` 的确认弹窗显示实际 `provider/model`。
- [ ] `modelUsed` 缺失时显示“未知”。
- [ ] 原有确认信息和行为保持不变。
- [ ] 覆盖格式化与调用链测试。
- [ ] `bun run verify` 通过。

## Answer

已实现：`JudgeResult.modelUsed` 会传入 `confirmToolCall`，确认弹窗显示实际 `provider/model`；缺失时显示“未知”。新增格式化与 `tool_call` 调用链测试。

验证：`bun run verify` 通过（57 个测试文件、874 项测试）。

## Comments

- Approval: 用户在本会话中选择“创建 .scratch 票据（推荐）”，作为本高风险权限 UI 变更的实施前记录。