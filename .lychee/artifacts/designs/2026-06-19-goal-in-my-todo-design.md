# Goal 功能设计文档

> 目标：在 `my-todo` 扩展中复刻 OpenAI Codex `/goal` 命令的核心能力
> 日期：2026-06-19
> 范围：pi-extensions/my-todo

---

## 1. 设计总览

`/goal` 是 Pi Agent 中用于**长周期目标驱动工作**的命令。用户输入一个自由文本目标后，Pi 会在每轮对话结束时检查目标是否达成；若未达成且未阻塞，Pi 会自动继续下一轮工作，直到目标完成、阻塞或用户主动暂停/清除。

本设计遵循以下原则：

- **与 Codex 原生体验一致**：`/goal` 只接收自然语言 objective，不强制结构化字段。
- **与现有 todo/plan mode 解耦但可协作**：`todo` 管任务清单，`goal` 管长期目标与自动继续。
- **thread 级持久状态**：目标状态随 session 保存和恢复。
- **证据驱动完成**：完成目标必须基于可验证证据，而非模型主观判断。
- **安全边界**：自动继续仅在安全事件边界触发，避免在用户输入排队或流式输出时抢跑。

---

## 2. 用户界面

### 2.1 命令

| 命令 | 行为 |
|------|------|
| `/goal <objective>` | 设置或覆盖当前目标。objective 为自由文本，状态变为 `active` |
| `/goal` | 显示当前目标状态 |
| `/goal pause` | 暂停自动继续，状态变为 `paused` |
| `/goal resume` | 恢复自动继续，状态变为 `active` |
| `/goal clear` | 清除当前目标，状态变为 `idle` |

### 2.2 工具

LLM 可调用的 `goal` 工具：

| action | 参数 | 说明 |
|--------|------|------|
| `evaluate` | `lastEvidence?`, `nextAction?`, `status?` | 评估当前进展，更新证据和下一步行动；status 仅允许 `active`/`paused`/`blocked` |
| `mark_complete` | `evidence` | 标记目标完成，必须附带验证证据 |
| `mark_blocked` | `reason`, `nextInputNeeded?` | 标记目标阻塞，必须说明阻塞原因 |

工具**不是**用户设置目标的入口，而是 LLM 在自动工作过程中用来记录进展和完成状态的。

### 2.3 Widget

在 TUI 中新增 `my-goal` widget，显示：

- 当前目标简述（截断）
- 状态：`active` / `paused` / `completed` / `blocked`
- 已迭代轮数
- 最近验证结果摘要

---

## 3. 数据模型

### 3.1 类型定义

新增 `GoalState` 到 `state.ts`（或新建 `goal.ts`）：

```typescript
export type GoalStatus = "idle" | "active" | "paused" | "completed" | "blocked";

export interface Goal {
  objective: string;                 // 用户输入的目标描述（自由文本）
  status: GoalStatus;
  iterationCount: number;            // 自动继续轮数
  lastEvidence: string;              // 最近验证结果（由模型通过 goal tool 提供）
  nextAction: string;                // 下一步行动（由模型通过 goal tool 提供）
  blocker?: string;                  // 阻塞原因
}
```

**不强制保存的结构化字段**：

Codex 的 `/goal` 不要求用户填写 verificationSurface、constraints、boundaries 等字段。这些由模型在每次迭代中从 `objective` 和对话上下文中自行理解。本设计保持同样简洁的模型。

### 3.2 状态持久化

与 `todo` 类似，`goal` 状态通过 tool result 的 `details` 持久化到 session entry 中。`GoalState` 从 session entries 反向扫描最后一个 `toolName === "goal"` 的 toolResult 恢复。

---

## 4. 生命周期与状态机

```
          /goal set
idle  ────────────────► active

active ──/goal pause──► paused
active ──blocked──────► blocked
active ──complete─────► completed

paused ──/goal resume─► active
paused ──/goal clear──► idle

blocked ──/goal clear─► idle
blocked ──/goal set───► active

completed ─/goal clear─► idle
completed ─/goal set───► active
```

---

## 5. 自动继续机制

### 5.1 触发条件

在 `agent_end` 事件中检查：

1. 当前存在 `active` 状态的 goal
2. 目标尚未 `completed` 或 `blocked`
3. 当前线程空闲，无用户输入排队
4. 上一轮确实有工具调用或产出，避免空转
5. 当前未处于 plan mode 的 planning 阶段（避免与现有对话框冲突）

### 5.2 用户中断

当 goal 处于 `active` 状态时，如果用户提交了一条新的普通消息（非 `/goal` 命令），goal 自动转为 `paused`。用户需要显式 `/goal resume` 才能恢复自动继续。这避免用户输入和自动 continue 互相抢占。

### 5.3 触发方式

满足条件时，调用：

```typescript
pi.sendUserMessage(goal.nextAction, { deliverAs: "followUp" });
```

如果 `nextAction` 为空，则发送默认消息：

```
Continue working toward the goal: <objective>

Evaluate progress against what "done" means for this goal, then choose the next useful action. Use the goal tool to record evidence and update the next step. Mark complete only when verified.
```

### 5.4 防自旋保护

- 如果某一轮没有任何工具调用，下一次自动继续被抑制（避免 LLM 空回）。
- 每轮自动继续前递增 `iterationCount`。
- 本设计**不设置硬编码的最大轮数上限**。停止依赖：证据完成、阻塞、用户 pause/clear、无工具调用。

---

## 6. 提示注入

### 6.1 before_agent_start

当 goal 状态为 `active` 时，注入隐藏 message：

```
You are working toward a goal:
<objective>

Current status: <status>
Iterations so far: <iterationCount>
Last evidence: <lastEvidence>

What "done" means and how to verify it should be inferred from the goal text and the conversation so far. Use the goal tool to evaluate progress, record evidence, update the next step, mark complete when verified, or mark blocked when no valid path remains.
```

### 6.2 完成时总结

当 goal 被标记为 `completed` 或 `blocked` 时，扩展不再触发自动 continue。`before_agent_start` 会追加一条提示，要求 LLM 在最终回复中输出：

- 目标是否达成
- 关键证据
- 所做变更摘要
- 阻塞原因（如 blocked）

`mark_complete` / `mark_blocked` 调用后， goal 状态即被持久化到 session，后续普通对话不再受 goal 驱动。

---

## 7. 与现有 my-todo 的集成

### 7.1 职责划分

| 模块 | 职责 |
|------|------|
| `todo` tool / `TaskState` | 任务清单、计划模式、执行阶段 |
| `goal` tool / `GoalState` | 长期目标、自动继续、证据验证 |

### 7.2 协作场景

- 用户可以用 `/goal` 设定大目标，同时用 `todo` 拆解子任务。
- plan mode 的 planning 阶段允许使用 `goal` tool 查看当前目标。
- executing 阶段和 goal active 阶段同时存在时，`goal` 的自动继续只会在非 planning 阶段触发。
- 若 goal active 时用户进入 `/todos plan`，goal 保持 active，但自动 continue 在 planning 阶段暂停；进入 executing 阶段后恢复。
- 若 plan mode 已 executing 时用户设置 `/goal`，二者并行工作：todo 管任务执行，goal 管目标验证和自动继续。

### 7.3 文件变更计划

现有文件：

| 文件 | 变更 |
|------|------|
| `index.ts` | 注册 `/goal` 命令、`goal` tool、goal 相关事件处理 |
| `state.ts` | 新增 `GoalState` 类，或拆分为 `task-state.ts` + `goal-state.ts` |
| `types.ts` | 新增 Goal 相关类型 |
| `overlay.ts` | 新增 `renderGoalOverlay` |
| `index.test.ts` | 新增 goal 相关测试 |

新增文件：

| 文件 | 说明 |
|------|------|
| `goal.test.ts`（或并入 `index.test.ts`） | GoalState 和自动继续逻辑测试 |

---

## 8. 测试策略

与现有扩展一致，要求 branches/functions/lines/statements 100% 覆盖率。

### 8.1 必须覆盖的测试

- `/goal` 命令：set / pause / resume / clear / status
- `goal` tool：evaluate / mark_complete / mark_blocked
- `GoalState.fromSession` 正确恢复状态
- `agent_end` 自动继续触发条件（active 触发、paused 不触发、completed 不触发、blocked 不触发、planning 阶段不触发）
- `before_agent_start` 在 active 时注入提示，其他状态不注入
- Widget 渲染更新

### 8.2 测试模式

沿用现有 mock 风格：

```typescript
const mockPi = {
  on: vi.fn((event, handler) => registeredEvents.set(event, handler)),
  registerTool: vi.fn((def) => registeredTools.push(def)),
  registerCommand: vi.fn((name, options) => registeredCommands.set(name, options)),
  sendUserMessage: vi.fn(),
};
```

---

## 9. 部署

复用现有 `scripts/deploy.ts`，将 `dist/index.js` 和 `my-todo.json` 复制到 `~/.pi/agent/extensions/my-todo/`。

无需新增配置文件内容，`my-todo.json` 保持空对象 `{}`。

---

## 10. 风险与边界

| 风险 | 缓解措施 |
|------|----------|
| 自动继续导致无限循环或模型空转 | 防自旋：无工具调用时抑制下一轮；用户可随时 `/goal pause` 或 `/goal clear` |
| 模型误判目标完成 | `mark_complete` 必须附带 evidence，提示强调 verified |
| 与 plan mode 的 agent_end 对话框冲突 | goal 自动继续在 planning 阶段不触发 |
| 多个 extension 同时注入 followUp | 由 Pi 核心按顺序处理，本扩展只在 agent_end 中注入一条 |
| session 恢复后状态不一致 | GoalState 从最后一个 goal tool result 恢复，与 TaskState 恢复方式一致 |

---

## 11. 实现阶段

建议按以下顺序实现：

1. **数据模型**：新增 `Goal` 类型和 `GoalState` 类，含恢复逻辑。
2. **命令与工具**：实现 `/goal` 命令和 `goal` tool。
3. **提示注入**：在 `before_agent_start` 注入 goal 上下文。
4. **自动继续**：在 `agent_end` 中实现事件驱动 follow-up。
5. **UI**：新增 goal widget，与现有任务 widget 共存。
6. **测试**：补齐单元测试，确保覆盖率 100%。
7. **部署验证**：`bun run deploy` + `/reload` + 手动测试 `/goal`。

---

## 12. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-19 | 完成 Goal 功能设计，确定在 my-todo 中以独立 goal 状态机方式实现 |
| 2026-06-19 | 调整为贴近 Codex 原生体验：`/goal` 仅接收自由文本 objective，不强制结构化字段 |
