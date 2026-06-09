# my-todo — 精简版 Pi Todo 扩展设计文档

## 背景

替换 `@juicesharp/rpiv-todo`，提供一个更精简、更可控的任务管理扩展。

## 目标

- 保留 `todo` tool、`/todos` slash command、overlay widget 三个核心能力
- 砍掉不常用的功能，降低心智负担
- 保持和 rpiv-todo 的状态机兼容，可直接迁移使用
- 代码结构清晰，测试友好

## 非目标

- 不实现任务依赖（blockedBy）
- 不实现 owner / metadata / activeForm 字段
- 不实现国际化（i18n）
- 不实现任务优先级、标签、计时器等高级功能（后续迭代再考虑）

---

## 架构

```
pi-extensions/my-todo/
├── types.ts           # Task 类型定义
├── state.ts           # 任务数组管理 + 状态机 + session 恢复
├── overlay.ts         # overlay 内容生成（纯函数）
├── index.ts           # 注册 tool、command、lifecycle 事件
├── index.test.ts      # 集成测试
├── state.test.ts      # state 模块单元测试
├── overlay.test.ts    # overlay 渲染单元测试
├── package.json       # bun workspace 配置
├── tsconfig.json      # TypeScript 配置
├── scripts/
│   └── deploy.ts      # 部署到 ~/.pi/agent/extensions/
└── my-todo.json       # Pi 扩展配置
```

### 设计原则

- **纯函数优先**：overlay.ts 全部纯函数，输入 tasks 输出字符串数组
- **状态隔离**：state.ts 管理全部可变状态，不直接依赖 Pi API
- **胶水层薄**：index.ts 只做注册和事件转发，不掺业务逻辑
- **风格一致**：和现有扩展（my-hud、my-visual-companion）保持相同代码风格

---

## 数据模型

```typescript
type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

interface Task {
  id: number;           // 自增 ID，从 1 开始
  subject: string;      // 任务标题（必填）
  description?: string; // 可选描述
  status: TaskStatus;   // 当前状态
}
```

### 状态机

```
pending ↔ in_progress
pending → completed
in_progress → completed
any → deleted（终端状态，list 时默认过滤）
```

非法转换返回错误，tasks 数组不变。

---

## 数据流与持久化

### 会话内流转

```
用户 prompt → LLM 调用 todo tool → state.ts 操作数组
  → 返回 tool result → Pi 存入 session entry
    → overlay.ts 生成 widget
```

### 持久化机制

Pi 扩展无本地文件持久化 API，状态靠 session entries 存活：

1. **`/reload` 存活**：`session_start` 扫描 `ctx.sessionManager.getEntries()`，找到 `toolName === "todo"` 的 toolResult entry，提取 `details.tasks` 恢复状态
2. **Compaction 存活**：Pi compact 保留 tool result entries，数据不丢失

### 初始化流程

```
session_start → 遍历 entries → 找到最后一个有效的 todo result
  → 恢复 tasks + nextId → 如有非 deleted 任务，触发 overlay 渲染
```

### Overlay 渲染时机

- `turn_start`：渲染当前任务列表
- `turn_end`：刷新 overlay
- `tool_execution_end`（todo tool）：立即刷新
- 空列表时自动隐藏（返回 `[]`）

---

## 组件接口

### state.ts

```typescript
export class TaskState {
  constructor(tasks?: Task[], nextId?: number);

  create(subject: string, description?: string): Task;
  update(id: number, updates: Partial<Pick<Task, "subject" | "description" | "status">>): Task;
  get(id: number): Task | undefined;
  list(includeDeleted?: boolean): Task[];
  delete(id: number): Task;
  clear(): void;

  getTasks(): Task[];
  getNextId(): number;
  snapshot(): { tasks: Task[]; nextId: number };

  // 从 session entries 恢复
  static fromSession(entries: SessionEntry[]): TaskState;
}
```

### overlay.ts

```typescript
export function renderOverlay(tasks: Task[]): string[];
```

输入当前任务数组，输出字符串数组（每行一个）。空数组表示隐藏 widget。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 非法状态转换 | 返回 `isError: true`，附带可读错误信息，数组不变 |
| 操作不存在的 ID | 返回错误，数组不变 |
| 空列表 list | 正常返回空数组 + 提示文本 |
| session 恢复 entry 损坏 | 跳过损坏 entry，继续扫描；全损坏则初始化为空 |
| subject 为空字符串 | create 时校验，返回错误 |

---

## Tool Schema

```typescript
{
  action: "create" | "update" | "list" | "get" | "delete" | "clear",
  // create
  subject?: string,
  description?: string,
  // update / get / delete
  id?: number,
  // update
  status?: "pending" | "in_progress" | "completed" | "deleted",
  // list
  includeDeleted?: boolean,
}
```

### 返回格式

```typescript
{
  content: [{ type: "text", text: string }],
  details: {
    action: TaskAction,
    params: Record<string, unknown>,
    tasks: Task[],
    nextId: number,
    error?: string,
  },
  isError?: boolean,
}
```

---

## Overlay 渲染策略

**简化规则（对比 rpiv-todo）：**

- 无 12 行阈值限制
- 无 completed 任务延迟消失逻辑
- 无按 owner 分组
- 纯文本列表，每行一个任务，格式：`[status] #id subject`

**示例输出：**

```
Tasks (3)
[⏳] #1 explore project context
[🔄] #2 present design sections
[✓] #3 write design doc
```

状态符号：pending `⏳`, in_progress `🔄`, completed `✓`, deleted `🗑`

---

## 测试策略

| 文件 | 覆盖内容 |
|------|----------|
| `state.test.ts` | CRUD、状态机转换（合法/非法）、nextId 递增、session 恢复、clear |
| `overlay.test.ts` | 空列表、单任务、多任务、各状态符号、长 subject 截断 |
| `index.test.ts` | tool 注册、command 注册、事件集成、端到端调用 |

**覆盖率目标：** branches / functions / lines / statements = 100%

---

## 部署

通过 `bun run deploy`（turbo pipeline）自动执行 `scripts/deploy.ts`，将构建产物复制到 `~/.pi/agent/extensions/my-todo/`。

---

## 后续迭代方向（暂不实现）

- 任务优先级 / 标签
- 任务计时器
- 任务模板 / 批量创建
- 国际化（如需多语言 UI）
