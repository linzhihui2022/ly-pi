# my-todo 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

为 Pi 提供本地任务与长期目标管理扩展，支持 `todo` 工具管理任务列表、`goal` 工具跟踪长期目标，并通过 `/todos`、`/goal` 命令和 TUI overlay 进行交互。

## 功能需求

### `todo` 工具

1. 注册 `todo` 工具，支持 `create`、`update`、`list`、`get`、`delete`、`clear` 操作。
2. 创建任务时必须提供 `subject`。
3. 更新任务时支持修改 `subject`、`description`、`status`。
4. 任务状态包括：`pending`、`in_progress`、`completed`、`deleted`。
5. 状态转换受限制：`completed` 只能转到 `deleted`；`deleted` 不可再转换。
6. 任务 ID 自增，支持从会话历史恢复。
7. `list` 操作默认排除已删除任务，支持 `includeDeleted` 参数。
8. 操作成功后刷新 TUI overlay。

### `/todos` 命令

1. `/todos` 或 `/todos list`：列出所有任务。
2. `/todos add <subject>`：创建任务。
3. `/todos done <id>`：标记任务完成。
4. `/todos start <id>`：标记任务进行中。
5. `/todos delete <id>`：删除任务。
6. `/todos clear`：清空所有任务。
7. `/todos plan`：进入计划模式。
8. `/todos execute`：从计划模式进入执行模式。
9. `/todos reset`：清空任务并退出计划模式。
10. 提供参数补全。

### 计划模式

1. 计划模式使用一个 overlay 展示待规划任务。
2. 计划模式下仅允许使用规划工具（`read`、`bash`、`grep`、`find`、`ls`、`ask_user_question`、`web_search`、`web_fetch`、`todo`）。
3. 计划模式下禁止修改文件的工具。
4. 支持 `Ctrl+Shift+P` 快捷键切换计划模式。
5. 计划完成后可执行计划；所有任务完成后自动退出计划模式。

### `goal` 工具

1. 注册 `goal` 工具，支持 `evaluate` 和 `mark_blocked` 操作。
2. `evaluate` 更新目标的证据、下一步行动和状态。
3. `mark_blocked` 将目标标记为暂停并提供阻塞原因。

### `/goal` 命令

1. `/goal` 或 `/goal show`：显示当前目标。
2. `/goal <objective>`：设置新目标。
3. `/goal edit <objective>`：编辑当前目标。
4. `/goal pause`：暂停目标。
5. `/goal resume`：恢复目标。
6. `/goal clear`：清除目标。
7. 设置新目标时若已有活跃目标，提示是否替换。
8. 会话启动时若目标处于暂停状态，提示恢复或清除。

### `goal_complete` 工具

1. 注册 `goal_complete` 工具。
2. 仅在目标为 `active` 时可调用。
3. 必须提供完成摘要。
4. 调用后标记目标完成，清理状态，终止当前 turn。

### 目标自动推进

1. 活跃目标在每次 agent 结束时自动增加迭代计数。
2. 若 assistant 消息因 aborted 或 error 停止，暂停目标并提示。
3. 超过最大自动继续次数（50）后暂停目标。
4. 无待处理消息时自动发送继续提示，推动目标完成。

### Harness 注入目标同步

1. 当 Pi 通过 `before_agent_start` 的 `systemPrompt` 注入活跃目标（如 goal-mode 续跑或会话恢复）时，扩展必须识别并同步到本地 `goalState`。
2. 同步条件：本地 `goalState` 为空，且 `systemPrompt` 包含 `Active /goal:` 与 `Goal-mode rules:` 区块。
3. 同步动作：创建 `active` 目标、持久化到 `goal-state` session entry、更新状态栏与 goal overlay。
4. 同步后，系统提示中已存在的 goal 区块不再重复追加。

### TUI 集成

1. 活跃任务和已完成任务分别渲染为 overlay widget。
2. 目标状态显示在 status bar。
3. 计划模式下显示计划 overlay。
4. 目标活跃时显示目标 overlay。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 修改业务逻辑必须补充或更新测试。
3. 覆盖率要求：branches / functions / lines / statements 全部 100%。
4. 构建命令：`bunx turbo run build`。
5. 测试命令：`bunx turbo run test` 或在扩展目录执行 `npx vitest run --coverage`。
6. 部署命令：`bun run deploy`，目标目录为 `~/.pi/agent/extensions/my-todo`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 任务截止日期或优先级 | 当前任务模型简单 |
| 多目标并行 | 同时只跟踪一个活跃目标 |
| 目标甘特图或时间线 | 超出当前范围 |
| 任务持久化到外部数据库 | 依赖会话 entries 恢复 |
| 用户自定义状态机 | 当前状态转换已固定 |

## 验收标准

1. `todo` 工具各操作行为正确。
2. `/todos` 命令和计划模式工作正常。
3. `/goal` 命令和 `goal` 工具状态转换正确。
4. 目标自动推进和暂停路径有测试覆盖。
5. Harness 注入目标的同步路径有测试覆盖。
6. TUI overlay 在状态变化时正确刷新。
7. 单元测试和覆盖率检查通过。

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 确认 todo/goal 工具、计划模式、目标自动推进与 Harness 注入同步需求，建立需求基线 |
