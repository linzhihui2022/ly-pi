# my-plan-mode Design

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-12  
> 设计结论：把 plan 模式合并进现有 `my-todo` 扩展，不新建独立扩展。

---

## 1. 设计目标

在现有 `my-todo` 扩展中增加一个 **Plan Mode（规划模式）**。进入该模式后，Pi 进入只读探索状态，LLM 只能使用只读工具制定计划；计划以任务列表形式存在。用户确认执行后，退出规划模式并恢复完整工具，后续通过 `todo` 工具推进任务状态。规划模式与现有任务管理共享同一份状态。

---

## 2. 状态定义

在 `my-todo` 中新增以下状态，与现有 `TaskState` 共存：

```ts
interface TodoExtensionState {
  planMode: boolean;
  planPhase: "idle" | "planning" | "executing";
  tasks: Task[];
  nextId: number;
}
```

| 字段 | 含义 |
|------|------|
| `planMode` | 是否处于规划模式。 |
| `planPhase` | 当前阶段：`idle`（普通任务模式）、`planning`（只读规划）、`executing`（执行阶段）。 |
| `tasks` | 任务/计划步骤列表。 |
| `nextId` | 下一个任务 ID。 |

规划模式通过 `todo` 工具的 `toolResult.details` 持久化，与 `my-todo` 现有状态恢复机制一致。

---

## 3. 命令与交互

### 新增/调整命令

| 命令 | 行为 |
|---|---|
| `/todos plan` | 进入规划模式（`planMode=true`, `planPhase=planning`）。如果已有任务，提示是否清空或保留。 |
| `/todos execute` | 手动退出规划模式并进入执行阶段（`planPhase=executing`）。 |
| `/todos reset` | 清空所有任务并退出规划模式（`planMode=false`, `planPhase=idle`）。 |
| 现有 `/todos ...` | 保持不变。 |

### 快捷键（可选）

`Ctrl+Shift+P` 切换规划模式。

### agent_end 后的弹框行为

当 `planMode && planPhase === "planning"` 时，弹选择框：

- **执行计划** → `planPhase = "executing"`，恢复完整工具，并提示 LLM 开始执行。
- **继续完善计划** → 保持规划模式。
- **放弃计划** → 清空任务并退出规划模式。

---

## 4. 工具白名单与系统提示注入

### 规划阶段允许的工具

当 `planMode && planPhase === "planning"` 时，激活以下工具：

```ts
["read", "bash", "grep", "find", "ls", "ask_user_question", "web_search", "web_fetch"]
```

其他工具（如 `edit`、`write`）被禁用。

### Bash 白名单

**不实现** bash 命令白名单。规划模式下允许使用 `bash`，由 LLM 自律，不额外拦截。

### 系统提示注入

在 `before_agent_start` 中，根据当前阶段注入隐藏消息（`display: false`）：

- **planning 阶段**：告知 LLM 当前处于规划模式，只能使用只读工具；应通过 `todo` 工具创建计划步骤；不要执行任何文件修改；可使用 `web_search` / `web_fetch` 调研外部信息。
- **executing 阶段**：告知 LLM 可以开始按任务列表顺序执行，并通过 `todo` 工具更新状态。

---

## 5. 计划生成与执行流程

### 规划阶段

1. 用户输入 `/todos plan`。
2. 状态变为 `planMode=true, planPhase=planning`。
3. `before_agent_start` 注入规划模式系统提示，工具白名单生效。
4. LLM 通过 `todo` 工具创建任务，每个任务即一个计划步骤。
5. agent_end 后弹框，用户选择下一步。

### 执行阶段

1. 状态变为 `planPhase=executing`，工具白名单解除。
2. `before_agent_start` 注入执行模式提示。
3. LLM 在执行中使用 `todo` 工具把任务标记为 `in_progress` / `completed`。
4. widget 随任务状态变化实时刷新。

### 完成

- 当所有任务都 `completed` 时，widget 显示完成摘要，并自动退出规划模式（`planMode=false, planPhase=idle`）。
- 用户也可随时输入 `/todos plan` 开始新计划，或 `/todos reset` 手动结束。

---

## 6. 数据持久化与状态恢复

采用方案 A：扩展 `todo` 工具 result details。

每次 `todo` 工具调用返回的 details 中加入 `planMode` 和 `planPhase`：

```ts
{
  action: string;
  params: object;
  tasks: Task[];
  nextId: number;
  planMode: boolean;
  planPhase: "idle" | "planning" | "executing";
}
```

`TaskState.fromSession()` 恢复时同时读取 `planMode` 和 `planPhase`。如果 details 中缺少这两个字段，默认回退到 `planMode=false, planPhase=idle`，保证向后兼容。

---

## 7. 模块职责划分

```
index.ts
  - 注册命令、快捷键、工具
  - 监听 session_start / turn_start / turn_end / agent_end / before_agent_start / tool_call
  - 维护 planMode / planPhase 状态
  - 协调 widget、弹框、系统提示注入

state.ts
  - TaskState 类：任务 CRUD、状态转换验证
  - 新增：从 details 中恢复 planMode / planPhase
  - 新增：snapshot 包含 planMode / planPhase

overlay.ts
  - 渲染任务 widget
  - 规划模式下标题可显示 "Plan" 或 "Executing"

types.ts
  - Task, TaskStatus, TaskAction 等现有类型
  - 新增 PlanPhase 类型
```

---

## 8. 测试策略

覆盖率要求：branches / functions / lines / statements 全部 100%（排除 `index.ts` 集成测试和 RealGitAdapter 等现有排除项）。

新增测试覆盖：

- `plan` 模式切换逻辑（进入/退出/执行/放弃）。
- `TaskState` 扩展字段的持久化与恢复。
- `before_agent_start` 系统提示注入条件。
- `tool_call` 工具白名单切换：
  - 规划阶段禁用 `edit`、`write` 等修改类工具。
  - 规划阶段允许 `web_search` / `web_fetch`。
  - 执行阶段和普通模式恢复全部工具。
- `agent_end` 弹框分支。
- widget 刷新逻辑。
- `/todos plan`、`/todos execute`、`/todos reset` 命令行为。

---

## 9. 变更范围

修改文件：

- `pi-extensions/my-todo/index.ts`
- `pi-extensions/my-todo/state.ts`
- `pi-extensions/my-todo/types.ts`
- `pi-extensions/my-todo/overlay.ts`
- `pi-extensions/my-todo/index.test.ts`
- `pi-extensions/my-todo/state.test.ts`
- `pi-extensions/my-todo/overlay.test.ts`

不新建扩展目录。不需要新增 JSON 配置文件。

---

## 10. 待实现清单

1. 在 `types.ts` 中新增 `PlanPhase` 类型。
2. 在 `state.ts` 中：
   - `TaskState` 增加 `planMode`、`planPhase` 字段。
   - `snapshot()` 和 `fromSession()` 支持读写这两个字段。
   - 更新 `isValidDetails` 校验。
3. 在 `overlay.ts` 中：
   - 根据 `planMode` / `planPhase` 调整 widget 标题（如 "Plan (3)" / "Executing (3)"）。
4. 在 `index.ts` 中：
   - 增加 `/todos plan`、`/todos execute`、`/todos reset` 命令。
   - 注册 `Ctrl+Shift+P` 快捷键。
   - 监听 `before_agent_start` 注入系统提示。
   - 监听 `tool_call` 实施只读阶段工具白名单。
   - 监听 `agent_end` 弹框。
   - 监听 `session_start` 恢复状态。
5. 补充测试，确保 100% 覆盖率。
