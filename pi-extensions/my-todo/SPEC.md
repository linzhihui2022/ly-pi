# my-todo Spec

> 状态：已确认，可作为开发基准  
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

my-todo 为 Pi 提供两层追踪能力：
- **任务（todo）**：短期的、可逐步完成的工作项。
- **目标（goal）**：长期的、跨多个 turn 的目标，支持自动推进。

## 2. 模块结构

```
pi-extensions/my-todo/
├── index.ts              # 扩展入口：注册事件、工具、命令、快捷键
├── state.ts              # 任务状态机与持久化恢复
├── goal-state.ts         # 目标状态机与持久化恢复
├── goal-logic.ts         # 目标提示词构建、状态格式化、继续标记
├── goal-command.ts       # /goal 命令解析
├── goal-complete.ts      # goal_complete 工具定义
├── goal-overlay.ts       # 目标 overlay 渲染
├── overlay.ts            # 任务 overlay 渲染
├── types.ts              # 共享类型
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── my-todo.json          # 配置占位
├── SPEC.md               # 本文档
└── REQUIREMENTS.md       # 需求清单
```

依赖方向：

```
index.ts → state.ts
        → goal-state.ts
        → goal-logic.ts
        → goal-command.ts
        → goal-complete.ts
        → overlay.ts
        → goal-overlay.ts
        → types.ts
```

## 3. 任务状态机

### 3.1 模型

```ts
interface Task {
  id: number;
  subject: string;
  description?: string;
  status: TaskStatus; // "pending" | "in_progress" | "completed" | "deleted"
}
```

### 3.2 状态转换

```
pending      → in_progress, completed, deleted
in_progress  → pending, completed, deleted
completed    → deleted
deleted      → (no transitions)
```

### 3.3 持久化

任务状态通过 `todo` 工具的 `details` 写入会话 entries。`TaskState.fromSession` 从最近的 `toolResult` 类型且 `toolName === "todo"` 的 entry 恢复。

## 4. `todo` 工具

| action | 参数 | 行为 |
|--------|------|------|
| create | `subject`, 可选 `description` | 创建新任务，默认状态 `pending` |
| update | `id`, 可选 `subject`/`description`/`status` | 更新任务，subject 不能为空 |
| list | 可选 `includeDeleted` | 返回任务列表 |
| get | `id` | 返回单个任务详情 |
| delete | `id` | 将任务状态置为 `deleted` |
| clear | 无 | 清空所有任务 |

所有操作在 details 中返回当前任务列表、nextId、planMode、planPhase。

## 5. `/todos` 命令

| 命令 | 行为 |
|------|------|
| `/todos` / `/todos list` | 列出任务 |
| `/todos add <subject>` | 创建任务 |
| `/todos done <id>` | 标记完成 |
| `/todos start <id>` | 标记进行中 |
| `/todos delete <id>` | 删除任务 |
| `/todos clear` | 清空任务 |
| `/todos plan` | 进入计划模式（planning phase） |
| `/todos execute` | 进入执行模式（executing phase） |
| `/todos reset` | 清空任务并退出计划模式 |

## 6. 计划模式

### 6.1 阶段

- `idle`：未进入计划模式。
- `planning`：只能使用规划工具，禁止修改文件。
- `executing`：可以使用所有工具完成任务。

### 6.2 允许工具

规划阶段允许：
`read`, `bash`, `grep`, `find`, `ls`, `ask_user_question`, `web_search`, `web_fetch`, `todo`。

`tool_call` 事件被拦截，非允许工具返回 `{ block: true }`。

### 6.3 计划完成

- 所有任务在 executing 阶段完成后，自动退出计划模式并提示。
- `agent_end` 在 planning 阶段会弹出选择：执行计划、继续规划、放弃计划。

## 7. 目标状态机

### 7.1 模型

```ts
interface ActiveGoal {
  id: string;
  text: string;
  status: GoalStatus; // "active" | "paused" | "complete"
  startedAt: number;
  updatedAt: number;
  iteration: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  blocker?: string;
  lastEvidence?: string;
  nextAction?: string;
}
```

### 7.2 状态转换

- `set` / `edit`：创建或编辑目标，状态为 `active`。
- `pause`：`active` → `paused`。
- `resume`：`paused` → `active`，清除 blocker。
- `markBlocked`：设置为 `paused` 并记录 blocker。
- `markComplete`：`active` → `complete`。
- `evaluate`：更新 evidence、nextAction、status（仅限 `active`/`paused`）。

## 8. `goal` 工具

- `evaluate`：
  - 记录历史 entry。
  - 更新 `lastEvidence`、`nextAction`。
  - 可选设置 status（仅 `active`/`paused`）。
  - `paused` 时若未设置 blocker，默认使用 "Paused by evaluate"。
- `mark_blocked`：
  - 要求提供 reason。
  - 设置状态为 `paused` 并记录 blocker。

## 9. `goal_complete` 工具

- 仅在目标状态为 `active` 时可用。
- 要求提供非空 `summary`。
- 调用后：
  - 标记目标完成。
  - 清理状态。
  - 通知用户。
  - 设置 `terminate: true` 结束当前 turn。

## 10. 目标自动推进

### 10.1 系统提示注入

`before_agent_start` 事件为活跃目标注入系统提示，包含：
- 目标文本。
- 目标模式规则：自主执行、不询问用户、持续验证、只在完成时调用 `goal_complete`。

### 10.2 继续机制

- 每次 `agent_end` 为活跃目标增加 `iteration`。
- 若上一条继续提示已送达且没有待处理消息，则发送下一条继续提示。
- 继续提示使用 marker 防止重复或取消后仍执行。
- 最大连续自动继续次数为 50。

### 10.3 暂停条件

- assistant 消息 `stopReason` 为 `aborted` 或 `error` 时暂停。
- `error` 时调用 `markBlocked` 记录错误信息。
- 超过 `MAX_CONTINUATIONS` 时暂停。

### 10.4 Harness 注入目标同步

当 Pi 的 goal-mode 在会话恢复或自动 continuation 时通过 `before_agent_start` 的 `systemPrompt` 注入活跃目标，但本地 `goalState` 为空（没有 `goal-state` session entry），扩展需要按以下流程同步：

1. `before_agent_start` 收到事件后，先检查 `goalState.get()`。
2. 若为空，调用 `goal-logic.ts` 的 `extractGoalTextFromSystemPrompt(event.systemPrompt)`。
3. 解析逻辑：
   - 查找 `"Active /goal:"` 前缀。
   - 查找后续 `"Goal-mode rules:"` 后缀。
   - 提取中间文本并 trim；为空则返回 `undefined`。
4. 若提取到非空目标文本：
   - `goalState.set(text)` 创建 `active` 目标。
   - `persistGoal(goal)` 写入 `goal-state` session entry。
   - `updateStatus(ctx, goal)` 更新状态栏。
   - `refreshWidgets(ctx)` 刷新 goal overlay。
5. 返回系统提示时，若 `event.systemPrompt` 已包含 `"Active /goal:"`，则不再追加 `buildGoalSystemPrompt`，避免重复。

### 10.5 状态恢复来源

本地 `goalState` 优先从 `goal-state` custom entry 恢复。若该 entry 不存在但系统提示中注入了 goal，则通过 10.4 流程在运行时重建。该机制确保 `goal_complete` 在 goal-mode 续跑场景下也能找到 active goal。

## 11. TUI 集成

- 任务 overlay：
  - `my-todo`：活跃任务（pending + in_progress）。
  - `my-todo-completed`：已完成任务。
  - 计划模式下合并为单一计划 overlay。
- 目标 overlay：
  - `my-goal`：展示当前活跃目标文本、迭代、耗时。
- 状态栏：
  - `my-todo-goal`：展示目标状态（active / paused / complete）。

## 12. 测试策略

- `state.ts`：任务 CRUD、状态转换、会话恢复单元测试。
- `goal-state.ts`：目标状态转换、entry 记录、会话恢复单元测试。
- `goal-logic.ts`：提示词构建、格式化函数、系统提示目标提取单元测试。
- `goal-command.ts`：命令解析单元测试。
- `goal-complete.ts`：工具执行逻辑测试。
- `overlay.ts` / `goal-overlay.ts`：渲染函数测试。
- `index.ts`：集成测试，mock ExtensionAPI、事件、TUI，覆盖 Harness 注入目标同步路径。
- 覆盖率目标：branches / functions / lines / statements 全部 100%。

## 13. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 任务截止日期或优先级 | 当前任务模型简单 |
| 多目标并行 | 同时只跟踪一个活跃目标 |
| 目标甘特图或时间线 | 超出当前范围 |
| 任务持久化到外部数据库 | 依赖会话 entries 恢复 |
| 用户自定义状态机 | 当前状态转换已固定 |

## 15. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 补充 my-todo 需求与规格文档，确认 todo/goal 工具、命令、计划模式与目标自动推进 |
| 2026-07-10 | 新增 Harness 注入目标同步规格与需求：在 `before_agent_start` 中从 system prompt 恢复活跃目标到本地 `goalState` |
