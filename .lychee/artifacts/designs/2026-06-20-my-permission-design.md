# my-permission 设计文档

## 目标

为 Pi agent 提供一个轻量级工具权限管理扩展，允许用户通过黑名单精确禁止指定工具的调用。

## 范围

### 做什么

- 通过 `pi-config/my-permission.json` 配置默认 deny 列表。
- 通过 `/permission` 命令在运行时动态调整 deny 列表。
- 使用 `pi.appendEntry` 将运行时覆盖持久化到当前 session。
- 在 `tool_call` 事件中拦截被禁工具，返回 `{ block: true, reason: "..." }`。
- 通过 `before_agent_start` 向 LLM 注入当前 deny 列表，减少无效尝试。

### 不做什么

- 不提供白名单模式（仅黑名单）。
- 不拦截用户手动执行的 `!bash` 命令（`user_bash` 事件）。
- 不修改 system prompt 中的可用工具列表（用户选择“仅拦截”）。
- 不对工具参数做内容级过滤（如禁止 `rm -rf /` 但允许其他 bash 命令）。

## 架构

```
pi-config/my-permission.json          # 默认黑名单配置
pi-extensions/my-permission/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── index.ts              # 扩展入口
├── types.ts              # PermissionState、PermissionConfig 类型
├── state.ts              # 权限状态管理
├── config.ts             # 读取 pi-config/my-permission.json
├── state.test.ts
├── config.test.ts
└── index.test.ts
```

### 组件职责

- `config.ts`：启动时读取 `pi-config/my-permission.json`，解析 `deny` 数组。文件不存在或格式错误时回退到空列表并通知用户。
- `state.ts`：维护运行时 deny 列表，提供 `deny(tool)`、`allow(tool)`、`list()`、`reset()`、`fromConfig(config)`、`fromEntries(entries)` 方法。
- `index.ts`：
  - `session_start`：从配置文件初始化 state，并尝试从 session entries 恢复运行时覆盖。
  - `registerCommand("permission", ...)`：提供 `/permission deny|allow|list|reset` 命令。
  - `on("tool_call", ...)`：检查 `event.toolName` 是否在 deny 列表，命中则 block。
  - `on("before_agent_start", ...)`：注入 hidden message，告知 LLM 当前被禁工具。

## 数据流

1. **启动/Reload**
   - `session_start` 触发。
   - 读取 `pi-config/my-permission.json`，得到默认 `deny`。
   - 扫描 session entries 中 `customType === "my-permission"` 的 entry，取最后一个（最新）entry 恢复运行时覆盖。
   - 若存在运行时覆盖，覆盖配置文件默认值。

2. **运行时命令**
   - `/permission deny <tool>`：加入 deny 列表并持久化。
   - `/permission allow <tool>`：从 deny 列表移除并持久化。
   - `/permission list`：显示当前 deny 列表。
   - `/permission reset`：清空运行时覆盖，恢复配置文件默认值，持久化。
   - 无参数或子命令未知时，显示用法提示。

3. **工具拦截**
   - `tool_call` 事件触发时检查 toolName。
   - 命中则返回 `{ block: true, reason: "Tool '<tool>' is denied by my-permission" }`。

4. **LLM 感知（默认开启）**
   - `before_agent_start` 注入一条 `display: false` 的 hidden message：
     > "The following tools are currently denied and cannot be used: edit, write, bash."

## 命令设计

```
/permission deny <tool>     # 禁止指定工具
/permission allow <tool>    # 恢复指定工具
/permission list            # 列出当前被禁工具
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

## 错误处理

1. **配置文件不存在**：默认空列表，通知用户。
2. **配置文件格式错误**：通知用户具体错误，回退到空列表。
3. **重复 deny/allow**：幂等，无错误。
4. **未知工具名**：允许加入 deny 列表，不校验工具是否存在。
5. **拦截范围**：只拦截 LLM 发起的 `tool_call`，不拦截 `user_bash`。
6. **reload 行为**：重新读取配置文件并重新应用 session entries 中的运行时覆盖。

## 测试策略

- `state.test.ts`：覆盖率 100%，覆盖 deny/allow/list/reset/fromConfig/fromEntries 的所有分支。
- `config.test.ts`：覆盖正常读取、文件不存在、JSON 解析错误、schema 错误。
- `index.test.ts`：模拟 ExtensionAPI，验证 tool_call 拦截、命令处理、`before_agent_start` 注入。
