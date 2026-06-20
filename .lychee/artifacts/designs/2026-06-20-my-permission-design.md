# my-permission 设计文档

## 目标

为 Pi agent 提供一个轻量级工具权限管理扩展，允许用户通过黑名单精确禁止指定工具的调用。

## 范围

### 做什么

- 通过 `pi-config/my-permission.json` 配置默认 deny 列表。
- 通过 `/permission` 命令在运行时动态调整 deny 列表。
- 使用 `pi.appendEntry` 将运行时覆盖以完整快照形式持久化到当前 session。
- 在 `tool_call` 事件中拦截被禁工具，返回 `{ block: true, reason: "..." }`。
- 通过 `before_agent_start` 向 LLM 注入当前 deny 列表，减少无效尝试。
- 命令反馈（通知、用法提示）使用中文。

### 不做什么

- 不提供白名单模式（仅黑名单）。
- 不拦截用户手动执行的 `!bash` 命令（`user_bash` 事件）。
- 不修改 system prompt 中的可用工具列表（用户选择“仅拦截”）。
- 不对工具参数做内容级过滤（如禁止 `rm -rf /` 但允许其他 bash 命令）。
- 工具名匹配采用**精确匹配、区分大小写**，不支持通配符或前缀匹配。
- 拦截行为**完全静默**，不通过 UI 通知用户，仅向 LLM 返回 block reason。

## 架构

```
pi-config/my-permission.json          # 默认黑名单配置
pi-config/pi-permission-system.json   # 遗留配置，保留参考，my-permission 不读取
pi-config/scripts/deploy.ts           # 追加 my-permission.json 的部署
pi-extensions/my-permission/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── index.ts              # 扩展入口
├── types.ts              # PermissionState、PermissionConfig 类型
├── state.ts              # 权限状态管理
├── config.ts             # 读取扩展目录下的 config.json
├── scripts/deploy.ts     # 部署 index.js
├── state.test.ts
├── config.test.ts
└── index.test.ts
```

### 组件职责

- `config.ts`：启动时优先读取部署目录 `~/.pi/agent/extensions/my-permission/config.json`；若不存在，回退到扩展自身目录下的 `config.json`。文件不存在时静默回退到空列表；格式错误时回退到空列表并通过 `ctx.ui.notify` 提示中文错误。
- `state.ts`：维护运行时 deny 列表，提供 `deny(tool)`、`allow(tool)`、`list()`、`reset()`、`fromConfig(config)`、`fromEntries(entries)` 方法。区分配置来源与运行时来源。
- `index.ts`：
  - `session_start`：从配置文件初始化 state，并尝试从 session entries 恢复运行时覆盖。
  - `registerCommand("permission", ...)`：提供 `/permission deny|allow|list|reset` 命令，并为 `deny`/`allow` 提供所有可用工具名的 tab 自动补全。
  - `on("tool_call", ...)`：检查 `event.toolName` 是否在 deny 列表，命中则 block。
  - `on("before_agent_start", ...)`：当 deny 列表非空时，注入 hidden message，告知 LLM 当前被禁工具。
  - `registerMessageRenderer("my-permission", ...)`：注册一个空 renderer，避免 hidden message 意外可见时无法渲染。

## 数据流

1. **启动/Reload**
   - `session_start` 触发。
   - 优先读取 `~/.pi/agent/extensions/my-permission/config.json`；若不存在，回退到扩展自身目录下的 `config.json`，得到默认 `deny`（`configDeny`）。
   - 扫描 session entries 中 `customType === "my-permission"` 的 entry，取最后一个（最新）entry 恢复运行时覆盖（`runtimeDeny`）。
   - 生效 deny = `runtimeDeny ?? configDeny`。

2. **运行时命令**
   - `/permission deny <tool>`：加入 deny 列表并追加完整快照 entry（即使结果未变化也追加）。
   - `/permission allow <tool>`：从 deny 列表移除并追加完整快照 entry（即使结果未变化也追加）。
   - `/permission list`：显示当前 deny 列表及每个工具的来源（config / runtime）。
   - `/permission reset`：清空运行时覆盖，恢复配置文件默认值，追加完整快照 entry；之后 `list` 显示配置文件内容。
   - 无参数或子命令未知时，显示中文用法提示。

3. **工具拦截**
   - `tool_call` 事件触发时检查 toolName。
   - 命中则返回 `{ block: true, reason: "Tool '<tool>' is denied by my-permission" }`。
   - 拦截完全静默，不通知用户。

4. **LLM 感知（默认开启）**
   - 仅当 deny 列表非空时，`before_agent_start` 每次注入一条 `display: false` 的 hidden message：
     > "The following tools are currently denied and cannot be used: edit, write, bash."

## 命令设计

```
/permission deny <tool>     # 禁止指定工具（单个）
/permission allow <tool>    # 恢复指定工具（单个）
/permission list            # 列出当前被禁工具及来源
/permission reset           # 恢复到配置文件默认值
```

## 配置格式

`pi-config/my-permission.json`：

```json
{
  "deny": ["edit", "write", "bash"]
}
```

- `deny`：字符串数组，每个元素是一个工具名。
- 文件不存在时等价于 `{ "deny": [] }`。
- 匹配精确、区分大小写。

## 错误处理

1. **配置文件不存在**：默认空列表，静默处理。
2. **配置文件格式错误**：使用 typebox 严格校验；校验失败时通过中文通知用户具体错误，并回退到空列表。
3. **重复 deny/allow**：幂等，无错误。
4. **未知工具名**：允许加入 deny 列表，不校验工具是否存在。
5. **拦截范围**：只拦截 LLM 发起的 `tool_call`，不拦截 `user_bash`。
6. **reload 行为**：重新读取配置文件并重新应用 session entries 中的运行时覆盖（保留运行时命令覆盖）。

## 测试策略

- `state.test.ts`：覆盖率 100%，覆盖 deny/allow/list/reset/fromConfig/fromEntries 的所有分支。
- `config.test.ts`：覆盖正常读取、文件不存在、JSON 解析错误、schema 错误。
- `index.test.ts`：模拟 ExtensionAPI，验证 tool_call 拦截、命令处理、`before_agent_start` 注入。
