# Goal 强制持续能力增强设计

## 背景

当前 `pi-extensions/my-todo` 中的 `/goal` 功能较为基础：
- `goal` tool 通过 `mark_complete` action 完成目标
- 自动继续依赖 `hadUsefulWork` 门槛
- 无 continuation 去重保护
- 无中断/错误自动暂停
- 无 `/goal edit`
- 使用 `toolResult` 恢复状态

本设计参考 `@narumitw/pi-goal`，在 **不引入 token 预算** 的前提下，将其余核心机制移植到 `my-todo` 扩展内。

## 目标

1. 引入独立 `goal_complete` 工具，移除 `goal` tool 的 `mark_complete` action
2. 通过 `before_agent_start` 注入 Codex-like persistence system prompt
3. 通过 `agent_end` 实现自动 continuation，使用 marker 去重和过期丢弃
4. 支持 `/goal edit <objective>`
5. `aborted`/`error` 时自动暂停目标
6. 使用 `pi.appendEntry('goal-state', { goal })` 持久化，支持 `/reload` 恢复
7. goal active 时禁止 `ask_user_question`
8. `/reload` 后若 goal 为 `paused`，询问用户是否继续

## 范围

### 在范围内

- `pi-extensions/my-todo/index.ts` 中 goal 相关命令、工具、事件钩子的重构
- `pi-extensions/my-todo/goal-state.ts` 状态机重写
- `pi-extensions/my-todo/goal-overlay.ts` 适配新字段
- `pi-extensions/my-todo/types.ts` 扩展 Goal 类型
- 新增/重写测试文件

### 不在范围内

- token 预算（预留字段，但本次不启用）
- 新建独立扩展包
- 修改 Task/TODO 相关逻辑
- 修改 `turbo.json`、`install.sh`、包配置

## 架构

```
pi-extensions/my-todo/
├── index.ts              # 扩展入口
├── types.ts              # 共享类型
├── state.ts              # TaskState（不变）
├── overlay.ts            # Task overlay（不变）
├── goal-state.ts         # ActiveGoal 状态机 + entries + 序列化
├── goal-overlay.ts       # Goal widget 渲染
├── goal-complete.ts      # goal_complete 工具定义
└── __tests__/
    ├── goal-state.test.ts
    ├── goal-complete.test.ts
    ├── goal-continuation.test.ts
    ├── goal-command.test.ts
    └── goal-recovery.test.ts
```

## 数据模型

```ts
type GoalStatus = "active" | "paused" | "complete";

interface ActiveGoal {
  id: string;              // UUID，用于 continuation marker
  text: string;            // 目标文本
  status: GoalStatus;
  startedAt: number;
  updatedAt: number;
  iteration: number;       // continuation 次数
  tokensUsed: number;      // 预留，本次不启用预算
  timeUsedSeconds: number;
  blocker?: string;        // paused 原因
}
```

## 命令

| 命令 | 行为 |
|---|---|
| `/goal` | 显示当前目标摘要 |
| `/goal <objective>` | 新建/替换目标（最大 4000 字符） |
| `/goal edit <objective>` | 修改当前目标文本 |
| `/goal pause` | 暂停 active 目标 |
| `/goal resume` | 恢复 paused 目标 |
| `/goal clear` | 清除当前目标 |

替换目标时弹出 `ctx.ui.confirm` 确认。

## 工具

### `goal` tool

保留 action：
- `evaluate`：更新 `lastEvidence`、`nextAction`，可切换 `active`/`paused`
- `mark_blocked`：设置 blocker 并切换为 `paused`

移除 `mark_complete` action。

### `goal_complete` tool

参数：
- `summary: string` — 完成摘要

行为：
1. 验证当前有 active goal
2. 将 activeGoal 置为 `complete`
3. 清理 activeGoal，持久化 `{ goal: null }`
4. 状态栏显示 `complete` 8 秒后清除
5. 返回 `{ content, details, terminate: true }`
6. `notify` 完成信息

## 事件循环

### `session_start`

1. 清理 `continuationPending` 和 `cancelledContinuationMarkers`
2. 从 `goal-state` custom entries 加载最后一个非 `complete` 的 goal
3. 更新状态栏
4. 若状态为 `paused`，弹出选择："Resume goal" / "Clear goal"

### `before_agent_start`

1. 调用 `markContinuationDelivered(event.prompt)` 释放已交付的 pending
2. 若处于 plan mode，注入 plan mode 提示（不变）
3. 若 goal active，追加 persistence system prompt：
   - `buildGoalSystemPrompt(activeGoal)` 使用 pi-goal 原文

### `agent_end`

1. plan mode 完成选择逻辑不变
2. 若 goal 不 active，直接返回
3. 记录 iteration（若此前无 pending continuation）
4. 更新 usage（time，token 预留）
5. 检查 final assistant 的 `stopReason`：
   - `aborted` / `error` → pause goal，notify，不发送 continuation
6. 持久化并更新状态栏
7. 若之前有 pending continuation 且现在已交付，清理 pending
8. 安全检查：仍是同一个 active goal，且无排队消息
9. 调用 `sendContinuationPrompt(pi, ctx, activeGoal)`

### `input`

拦截 source 为 `extension` 的输入，若其 marker 在 `cancelledContinuationMarkers` 中，返回 `{ action: "handled" }`。

### `tool_call`

若 `activeGoal?.status === "active"` 且 `event.toolName === "ask_user_question"`，则 `block: true`。

## 自动继续机制

### Continuation Prompt

使用 pi-goal 原文：

```txt
Continue the active /goal until it is complete:

<goal text>

This is automatic continuation #<iteration>. Current files, command output, tests, and external state are authoritative; re-check them as needed. Keep going until this goal is completely resolved end-to-end. Do not redefine this goal into a smaller task. Do not stop at analysis, a plan, TODO list, partial fixes, or suggested next steps. Autonomously perform implementation and verification with the available tools when they are needed. Treat the current worktree, command output, tests, and external state as authoritative. If a tool call fails, try reasonable alternatives instead of yielding early. Before calling goal_complete, audit this goal requirement by requirement against the verified current state. Only call the goal_complete tool after this goal is fully complete and verified.

<!-- pi-goal-continuation:<id>:<iteration> -->
```

### 去重与过期保护

- `continuationPending` 记录当前已发送未交付的 continuation
- `cancelledContinuationMarkers` 记录因 pause/clear/edit/替换而失效的 marker
- marker 格式：`<goalId>:<iteration>`
- 同一 goal 同一 iteration 只发送一次 continuation
- `hasPendingMessages(ctx)` 阻止发送新 continuation
- 用户 pause/clear/edit/替换时调用 `cancelContinuationPending()`，将 pending marker 移入 cancelled set

### 安全措施

- `iteration > 100` 时发送特殊提示要求模型检查范围
- `aborted` / `error` 自动 pause
- 无 token 预算，但保留 `tokensUsed` 字段便于后续扩展

## 持久化

```ts
const GOAL_STATE_ENTRY_TYPE = "goal-state";

function persistGoal(goal: ActiveGoal | null) {
  pi.appendEntry(GOAL_STATE_ENTRY_TYPE, { goal });
}
```

恢复：
- 读取最后一个 `customType === GOAL_STATE_ENTRY_TYPE` 的 entry
- 若 `goal.status === "complete"`，不恢复
- 否则恢复为当前 activeGoal

## Overlay

对齐 pi-goal 最小信息：
- `Goal [status]`
- 截断后的 objective
- `Iterations: <iteration>`
- paused 时显示 blocker

不显示 evidence 和完整 blocker。

## 错误处理

| 场景 | 行为 |
|---|---|
| 无 goal 时 pause/resume/clear | notify 提示 |
| 无 goal 时调用 goal tool | tool 返回 error |
| 非 active 时调用 goal_complete | tool 返回 error |
| 替换目标被取消 | 保留原 goal |
| sendContinuationPrompt 失败 | 清理 pending，notify 错误 |

## 测试策略

覆盖率要求：branches/functions/lines/statements 100%（`index.ts` 和 `types.ts` 排除）。

| 测试文件 | 重点 |
|---|---|
| `goal-state.test.ts` | 状态机、entries、iteration 上限 |
| `goal-complete.test.ts` | 完成工具、无 active 报错、terminate、8 秒清除 |
| `goal-continuation.test.ts` | 自动继续、去重、过期丢弃、中断暂停、pending 消息阻止 |
| `goal-command.test.ts` | 命令解析、替换确认、最大长度 |
| `goal-recovery.test.ts` | session 恢复、paused 询问继续 |

## 部署验证

```bash
bunx turbo run build
cd pi-extensions/my-todo && bun test
bun run deploy
```

手动验证：
1. `/goal refactor auth handling` → 状态栏 `active 0s`
2. 目标未完成时自动触发 continuation
3. `/goal pause` → 停止自动继续
4. `/goal resume` → 继续
5. 通过 `goal_complete` 结束 → 状态栏 `complete` 8 秒后消失
6. `/reload` 后 paused goal 询问是否继续

## 设计决策记录

1. **保留在 my-todo 内**：避免新增独立包，减少配置复杂度。
2. **独立 `goal_complete` 工具**：与 pi-goal 一致，支持 `terminate: true`。
3. **移除 `goal` tool 的 `mark_complete`**：避免双路径，强制使用 `goal_complete`。
4. **状态名对齐 pi-goal**：`active`/`paused`/`complete`，不用 `blocked`。
5. **不用 toolResult 恢复**：改用 `custom` entry，与 pi-goal 一致，解耦持久化与工具返回值。
6. **不启用 token 预算**：用户明确要求除外，但保留字段便于扩展。
7. **goal active 时 block `ask_user_question`**：确保模型不中断目标等待用户输入。
8. **对齐 pi-goal 通知策略**：set/pause/resume/clear/edit/complete 都 notify。
