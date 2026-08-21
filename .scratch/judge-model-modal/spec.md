# 法官确认弹窗显示模型

Status: approved
Risk: High — 权限执行机制 UI

## Problem Statement

法官将工具调用判为不安全时，确认弹窗展示了操作、输入、路径、理由与安全评分，但用户无法得知本次判定实际使用了哪个法官模型，难以判断判定来源。

## Solution

在确认弹窗的正文中新增一行“法官模型”，展示本次 Judge 调用实际使用的 `JudgeResult.modelUsed`（`provider/model`）。模型调用未成功或没有模型标识时显示“未知”。

## Acceptance Criteria

1. 不安全判定的确认弹窗显示“法官模型：<provider>/<model>”。
2. `modelUsed` 缺失时，弹窗显示“法官模型：未知”。
3. 弹窗继续显示既有操作、输入、工作目录、路径、理由和评分信息。
4. 传递实际使用的模型，不以静态配置值替代。
5. 覆盖纯格式化与 `tool_call` 调用链测试；全量 `bun run verify` 通过。

## Out of Scope

- 修改 Judge 模型选择或回退策略。
- 修改 JUDGE.md、判定提示词或风险规则。
- 在安全放行、不经确认的调用中额外显示模型。

## Approval Record

用户在本会话中明确选择“创建 .scratch 票据（推荐）”，授权为本需求建立可审计票据并在记录后实施。该变更的范围限于上述确认弹窗内容与必要测试。