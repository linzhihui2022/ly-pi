# my-permission 规格文档

> 状态：已确认，可作为实现基准
> 确认日期：2026-07-22
> 需求文档：[REQUIREMENTS.md](./REQUIREMENTS.md)

## 1. 设计目标

`my-permission` 是一个独立的 Pi 扩展，通过监听 `tool_call` 事件，在工具执行前完成权限裁决。裁决流程结合：

- 用户配置的确定性规则（`allow` / `ask` / `deny`）；
- 轻量模型 `deepseek/deepseek-v4-flash` 对未命中规则的场景做安全预审；
- 父会话弹窗确认 / 子会话直接拒绝的差异化处理。

## 2. 模块结构

```
pi-extensions/my-permission/
├── index.ts              # 副作用入口：注册 tool_call 事件
├── types.ts              # 共享类型
├── config.ts             # 加载/校验 config.json
├── rules.ts              # 规则匹配引擎
├── judge.ts              # 模型法官调用
├── ui.ts                 # 弹窗确认与 session 缓存
├── utils.ts              # 路径/symlink/命令拆分等辅助函数
├── config.json           # 默认配置文件（随扩展部署）
├── scripts/deploy.ts     # 部署脚本
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

依赖方向：

```
index.ts
  ├── config.ts
  ├── rules.ts
  ├── judge.ts
  ├── ui.ts
  └── utils.ts
      └── types.ts
```

纯逻辑模块不依赖 `index.ts`，避免循环依赖。

## 3. 数据类型

### 3.1 配置类型

```typescript
type Action = "allow" | "ask" | "deny";

interface DenyWithReason {
  action: "deny";
  reason: string;
}

type RuleValue = Action | DenyWithReason;

interface PermissionMap {
  [pattern: string]: RuleValue;
}

interface PermissionConfig {
  [surface: string]: RuleValue | PermissionMap;
}

interface Config {
  defaultPolicy?: Action;
  judgeModel?: string;
  judgeTimeoutMs?: number;
  childPolicy?: "deny-on-unsafe" | "allow-on-safe";
  permission?: PermissionConfig;
}
```

- `RuleValue` 为字符串或 `{ action: "deny", reason: string }` 对象；对象仅用于 `deny`。
- `PermissionMap` 顶层 `"*"` 表示该 surface 的默认策略。

### 3.2 裁决结果

```typescript
interface Verdict {
  action: "allow" | "ask" | "deny";
  reason?: string;
  source?: string;       // 命中规则的来源，用于日志
  matchedPattern?: string;
}

interface JudgeResult {
  safe: boolean;
  reason: string;
  toolFor: string;
}
```

## 4. 裁决流程

```text
tool_call event
    │
    ▼
提取 surface / value / paths
    │
    ├─ path 层 ────────────────┐
    ├─ external_directory 层 ────┤  各层分别评估
    ├─ surface 层（tool 专属） ──┘
    │
    ▼
合并各层结果：deny > ask > allow
    │
    ├─ allow ───────► 放行
    ├─ deny ────────► block
    └─ ask ─────────► 模型法官
            │
            ▼
    deepseek/deepseek-v4-flash
            │
   safe ────┴── unsafe
    │            │
    ▼            ▼
  放行      父会话：ctx.ui.confirm
            子会话：deny
```

### 4.1 分层评估细节

- **`path` 层**：适用于所有携带文件路径的工具调用，包括 `read`/`write`/`edit`/`grep`/`find`/`ls`、`bash` 中的路径 token、`mcp` 中 `input.arguments.path` 等。
  - 对 `bash` 命令提取路径候选 token（点文件、相对路径、绝对路径）分别评估。
  - 匹配时同时比较原始路径和 `realpath` 解析后的路径。
  -  bare 文件名（如 `id_rsa`）只有在存在具体非 `"*"` 的 `path` 规则时才被纳入评估。

- **`external_directory` 层**：检测访问路径是否超出 `ctx.cwd`。
  - 仅当存在路径输入时触发；纯网络/无路径操作跳过。
  - 相对路径以 `ctx.cwd` 为基准解析；绝对路径直接判断。
  - 设备路径（`/dev/null` 等）不参与判断。

- **`surface` 层**：按 `toolName` 匹配，如 `bash`、`read`、`mcp`、`skill`、自定义工具名。
  - `bash` 命令按 `&&`、`||`、`;`、`|`、`&`、换行拆分为顶层命令单元分别评估，取最严格结果。
  - 命令中环境变量赋值前缀（如 `AWS_PROFILE=prod`）被剥离后评估底层命令。
  - 引用字符串内的操作符不拆分命令。

### 4.2 合并策略

各层独立返回 `Verdict`；最终裁决：

- 任一层返回 `deny` → `deny`（优先使用第一个 `deny` 的 `reason`）。
- 无 `deny` 但任一层返回 `ask` → `ask`。
- 全部 `allow` → `allow`。

## 5. 模型法官

### 5.1 模型选择

- 默认使用 `deepseek/deepseek-v4-flash`。
- 通过 `ctx.modelRegistry.find(provider, id)` 查找模型，其中 `provider` 与 `id` 从 `judgeModel` 按第一个 `/` 拆分；解析失败时 fallback 到 `ctx.model`（当前会话模型），若仍失败则 fallback 到 `ask`/`deny`。
- 使用 `ModelRuntime.create()` 获得独立的 `Models` 实例，调用 `complete(model, context)` 完成一次性评审。

### 5.2 Prompt 设计

```text
你是一名编码助手的安全门禁。评估以下工具调用是否可以自动执行。

当前工作目录：{cwd}
工具名：{toolName}
工具输入（已脱敏）：{inputJson}

只回复严格 JSON：
{
  "safe": boolean,
  "score": number, // 1-10，分数越高越安全
  "reason": "一句话说明为什么安全或不安全",
  "toolFor": "一句话说明该工具调用会做什么"
}

判断标准：
- 安全：只读操作、git status/diff/log、运行测试、构建项目、安装项目依赖等。
- 不安全：rm -rf、sudo、chmod/chown 777、写入密钥（.env、.pem、ssh 密钥）、无明确理由访问项目外文件、通过网络发送凭证、任意代码执行等。
- 保持简洁。不要包含 markdown 格式。
```

### 5.3 解析与容错

- 从模型返回中提取 JSON 对象；允许 JSON 被包裹在 markdown code fence 中。
- 解析失败、缺少字段或 `safe` 非布尔值时，视为评审失败。
- `score` 为可选数字，范围 1-10；缺失或非法时视为评审失败。
- 评审失败时：父会话 fallback 到 `ask`（弹窗），子会话 fallback 到 `deny`。

## 6. 子代理处理

- 通过 `process.env.PI_SUBAGENT_PARENT_SESSION` 检测子代理进程。
- 子会话中不调用 `ctx.ui.confirm`；即使 `ctx.hasUI` 为 true 也按无 UI 处理。
- 子会话裁决路径：
  - 规则命中 `allow` → 放行。
  - 规则命中 `deny` → deny。
  - `ask` 或默认策略 → 走法官。
    - `safe === true` → 放行。
    - `safe === false` 或评审失败 → deny。
- 配置项 `childPolicy` 仅用于显式声明，默认 `deny-on-unsafe` 即上述行为。

## 7. UI 确认（父会话）

- 当最终裁决为 `ask` 且法官返回 `safe === false` 或评审失败时触发。
- 弹窗标题统一为中文：`确认工具调用：{toolName}`。
- 弹窗正文通过 `formatConfirmMessage` 组装，结构化展示以下信息：
  - 工具：`{toolName}`
  - 操作：`{toolFor}`（法官一句话摘要）
  - 输入：`{value}`（原始 tool input 字符串）
  - 工作目录：`{cwd}`
  - 涉及路径：当 `paths` 非空时列出，否则省略
  - 理由：`{reason}`（法官返回 JSON 中的 `score` 会作为 `（安全评分：{score}/10）` 附在理由后展示）
- 法官调用失败时不再显示 `No model judgment available`，而是给出具体原因：
  - 未找到可用/已认证的法官模型：`未找到可用的法官模型，请手动确认`
  - 模型调用超时：`法官模型调用超时（{judgeTimeoutMs}ms），请手动确认`
  - 模型返回无法解析：`法官模型返回格式不正确，请手动确认`
  - 其他调用错误：`法官模型调用失败，请手动确认`
- 用户同意 → 放行，并记录 session 级缓存（键：surface + value），后续相同调用直接放行。
- 用户拒绝 → `block`，返回 `{ block: true, reason: "User denied: {reason}" }`。
- 无 UI 时（`!ctx.hasUI`）：父会话中 fallback 到 `deny`（与子会话一致），block reason 使用法官给出的具体原因。

## 8. 错误处理

| 场景 | 行为 |
|------|------|
| `config.json` 不存在 | 使用默认配置：`defaultPolicy: "ask"`、`judgeModel: "deepseek/deepseek-v4-flash"`、`judgeTimeoutMs: 8000` |
| `config.json` 解析失败 | 控制台 warn 一次，使用默认配置 |
| 规则匹配异常 | 该层视为 `ask` |
| 法官模型解析失败 | fallback 到 `ctx.model`（当前会话模型），再失败则返回 `未找到可用的法官模型，请手动确认`；父会话弹窗 / 无 UI 或子会话 deny |
| 法官模型调用失败/超时 | 返回具体原因（超时带 `judgeTimeoutMs`），父会话弹窗 / 无 UI 或子会话 deny |
| 法官输出 JSON 解析失败 | 返回 `法官模型返回格式不正确，请手动确认`；父会话弹窗 / 无 UI 或子会话 deny |
| 弹窗用户拒绝 | block + reason |
| 弹窗用户同意 | allow，加入 session 缓存 |

## 9. 配置示例

```json
{
  "defaultPolicy": "ask",
  "judgeModel": "deepseek/deepseek-v4-flash",
  "judgeTimeoutMs": 8000,
  "childPolicy": "deny-on-unsafe",
  "permission": {
    "path": {
      "*": "allow",
      "*.env": "deny",
      "*.env.*": "deny",
      "*.pem": "deny",
      "id_rsa*": "deny",
      "~/.ssh/*": "deny",
      "~/.aws/*": "deny"
    },
    "external_directory": {
      "*": "ask",
      "~/.cargo/registry/*": "allow"
    },
    "read": "allow",
    "write": {
      "*": "ask",
      "*.md": "allow"
    },
    "bash": {
      "*": "ask",
      "rm -rf *": "deny",
      "sudo *": "deny",
      "env": "deny",
      "printenv": "deny",
      "git status": "allow",
      "git diff": "allow",
      "git log *": "allow"
    },
    "mcp": { "*": "ask" },
    "skill": { "*": "ask", "web-search-researcher": "allow" }
  }
}
```

## 10. 测试策略

| 测试文件 | 覆盖内容 |
|----------|----------|
| `utils.test.ts` | 路径规范化、symlink 处理、bash 命令拆分、环境变量前缀剥离 |
| `rules.test.ts` | 单层 last-match-wins、多层 most-restrictive、path/external_directory/surface 组合 |
| `config.test.ts` | 配置加载、缺省、解析失败 fallback |
| `judge.test.ts` | mock `ModelRuntime.complete`，覆盖 safe/unsafe/异常/JSON 解析失败/模型解析失败 |
| `ui.test.ts` | mock `ctx.ui.confirm`，覆盖同意/拒绝/session 缓存 |
| `index.test.ts` | mock `ExtensionAPI` 与 `tool_call` 事件，走完整流程 |

- 覆盖率目标：`branches / functions / lines / statements` 全部 100%。
- 排除项：`types.ts`、集成入口 `index.ts`。
- 运行命令：`cd pi-extensions/my-permission && npx vitest run --coverage`。

## 11. 部署

- `package.json` 提供 `build`/`test`/`deploy`/`typecheck` 脚本。
- `build` 输出 `dist/index.js`，并标记 `@earendil-works/*` 为 external。
- `deploy` 将 `dist/index.js` 复制到 `~/.pi/agent/extensions/my-permission/index.js`。
- `config.json` 复制到 `~/.pi/agent/extensions/my-permission/config.json`。
- 支持 `/reload` 热重载。

## 12. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-22 | 创建 `my-permission` 规格文档，确认模块结构、裁决流程、模型法官、子代理策略与测试策略 |
