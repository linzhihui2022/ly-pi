# my-permission 需求文档

> 状态：已确认，可作为实现基准
> 确认日期：2026-07-22
> 规格文档：[SPEC.md](./SPEC.md)

## 1. 目标

`my-permission` 是一个独立的 Pi 扩展，用于在所有 `tool_call` 执行前做权限裁决：

- 先匹配用户配置的确定性规则；
- 无规则命中时默认进入 `ask`；
- `ask` 由轻量模型 `deepseek/deepseek-v4-flash` 预审安全性；
- 模型认为安全则直接放行，认为不安全则在父会话弹窗确认，子会话直接拒绝；
- 法官调用失败时保守 fallback。

## 2. 功能需求

### 2.1 规则层

1. 支持 `path`、`external_directory` 两个 cross-cutting 规则层，以及按 `toolName` 配置的 surface 规则层。
2. 规则使用通配符匹配（`*` 跨目录，`?` 单字符）。
3. 同一层内 **最后匹配的规则生效**。
4. 多层之间取 **最严格结果**：`deny` > `ask` > `allow`。
5. `path` 匹配时同时比较原始路径和 symlink 解析后的真实路径，防止绕过。
6. `external_directory` 检测路径是否超出当前工作目录（`cwd`）。

### 2.2 模型法官

1. 默认使用模型 `deepseek/deepseek-v4-flash`。
2. 法官 prompt 要求输出严格 JSON：`{ safe: boolean, score: number, reason: string, toolFor: string }`，其中 `score` 为 1-10 的安全评分，越高越安全。
3. `toolFor` 用一句话概括该工具调用会做什么。
4. `safe` 仍作为最终放行/弹窗依据；`score` 用于在 UI 中展示。
5. 法官超时或输出异常时 fallback 到 `ask`（父会话）或 `deny`（子会话）。
6. 超时时间默认可配置，建议 8 秒。

### 2.3 UI 确认

1. 父会话中，法官认为不安全时调用 `ctx.ui.confirm` 弹窗；弹窗展示 `toolFor`、`reason` 以及 `score`（`安全评分：{score}/10`）。
2. 用户可单次放行或拒绝；拒绝时 block 并附带 `reason`。
3. 子会话中不弹窗，按 `childPolicy` 直接决定。

### 2.4 子代理处理

1. 通过 `process.env.PI_SUBAGENT_PARENT_SESSION` 检测子代理进程。
2. 子会话中所有 `ask` 都先走法官；法官认为 `safe` 才放行，否则 `deny`。
3. 法官异常/超时时子会话直接 `deny`。

### 2.5 配置

1. 配置文件 `config.json` 与扩展目录同级，随扩展一起部署到 `~/.pi/agent/extensions/my-permission/`。
2. 配置项包括：
   - `defaultPolicy`：无规则命中时的默认行为（`allow` / `ask` / `deny`）。
   - `judgeModel`：法官模型，默认 `deepseek/deepseek-v4-flash`。
   - `judgeTimeoutMs`：法官调用超时毫秒数。
   - `childPolicy`：子会话中 unsafe 时的行为，默认 `deny-on-unsafe`。
   - `permission`：规则表。
3. 配置缺失或解析失败时 fallback 到 `defaultPolicy: ask` + 法官。

## 3. 非功能需求

1. 使用 TypeScript + Bun + Vitest 技术栈。
2. 代码覆盖率：`branches / functions / lines / statements` 全部 100%。
3. 排除项：`types.ts`（纯类型）、`index.ts`（集成入口）。
4. 不引入 `@gotgenes/pi-permission-system` 作为依赖；保持独立。
5. 不依赖外部 HTTP 端点；模型调用通过 Pi 内置的 `ModelRuntime` 完成。

## 4. 验收标准

1. 目录存在 `REQUIREMENTS.md` 与 `SPEC.md`。
2. 目录存在 `package.json`、`tsconfig.json`、`vitest.config.ts`、`config.json`。
3. `bunx turbo run build test` 在 `my-permission` 下通过，覆盖率 100%。
4. 部署后 `~/.pi/agent/extensions/my-permission/` 包含 `index.js` 与 `config.json`。
5. 规则匹配覆盖 `path`、`external_directory`、`bash`、`read`、`write`、`mcp`、`skill` 等场景。
6. 子代理会话中法官 unsafe 时直接 deny，不弹窗。
7. 法官输出 `{ safe, score, reason, toolFor }` 并被正确解析；弹窗展示 `score`。

## 5. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 与 `@gotgenes/pi-permission-system` 集成 | 需求明确为独立拦截器 |
| 通过 `contact_supervisor` 向父会话转发权限询问 | 用户选择子会话中 unsafe 直接 deny |
| 持久化批准/拒绝历史 | 仅使用 session 级内存缓存 |
| 支持命令行或 TUI 动态修改规则 | 规则改动通过编辑 `config.json` 并 `/reload` |
| 为每个 MCP 工具单独配置规则 | 仅支持 umbrella `mcp` surface 规则 |

## 6. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-22 | 创建 `my-permission` 需求文档，确认独立规则 + 模型法官 + 子代理策略 |
