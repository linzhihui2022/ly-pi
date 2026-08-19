# 自动生成 Session Display Name

Status: ready-for-agent

## Problem Statement

Pi 的 session selector 在没有显式名称时回退展示首条消息。长会话、resume 和 fork 场景下，首条消息不一定是稳定、可扫描的任务标签；用户希望每个主交互 session 自动拥有 Pi 原生的 Session Display Name。

## Solution

新增 `my-session-name` 扩展模块，使用首条进入 agent 前的展开后用户 prompt 请求一次专用标题摘要，并通过 `pi.setSessionName()` 写入 Pi 的 Session Display Name。标题请求后台执行，不阻塞首个回答；请求失败或输出不合格时保持未命名，让 Pi 使用原生首条消息回退。

## User Stories

1. As a pi 用户, I want 新 session 在首条消息后自动获得短标题, so that session selector、终端标题和 footer 更容易识别。
2. As a pi 用户, I want resume 旧的无名 session 时自动补标题, so that 功能不会只对上线后的 session 生效。
3. As a pi 用户, I want fork session 保留来源名称并带短标识, so that 多个分支可区分且不会改变父 session 的名称。
4. As a pi 用户, I want 手动设置的名称永远优先, so that 自动命名不会覆盖我的意图。

## Domain Decisions

- `Session Display Name` 是人类可读标签，与 `sessionId` 分离。
- 处理主 session 的 `interactive` 与 `rpc` 用户输入；跳过 extension 注入和后台 subagent。
- `new` session 等首条输入；`startup`、`reload`、`resume` 对已有首条用户消息但无名的 session 补命名；`fork` 使用当前基础名并追加分支后缀。
- 标题输入使用首条进入 agent 前的展开后 prompt；`/skill:*` 和模板使用展开后的实际任务。首条 prompt 按原文发送给标题模型。
- 标题模型复用 `deepseek/deepseek-v4-flash`，每个 session 最多一次请求，后台异步执行，不重试、不提示失败。
- 标题输出去首尾空白和包裹引号；必须是非空、单行、无控制字符且不超过 20 个字符，否则保持未命名。
- fork 名称为 `基础名称-<子 sessionId 的 6 位小写 hex hash>`；LLM 自动生成的基础名称先限制在 20 个字符以内，用户手动名称保持原样后再追加 hash。
- fork 没有基础名称时，先从已有首条展开后 prompt 生成基础名称，再追加 hash；没有可用 prompt 时保持未命名。
- 用户显式设置名称后不再被自动逻辑覆盖；用户重命名 fork 后，`resume`/`reload` 不补回后缀。fork 后缀只在 `session_start(reason="fork")` 创建时追加一次。

## Implementation Decisions

- 新建 `ly-pi/my-session-name/`，在统一 `ly-pi/index.ts` 注册。
- 使用 `before_agent_start` 获取展开后 prompt，并结合 `input` 的 source 过滤 extension 注入；使用 `session_start` 处理旧 session、fork 和生命周期状态。
- 使用 Pi 0.78 兼容的 `ctx.modelRegistry.find()`、`getApiKeyAndHeaders()` 与 `pi-ai` `completeSimple()` 调用标题模型；不升级既有 Pi 依赖版本。
- 使用 session generation token 与当前名称双重竞态保护：标题返回时只有请求仍属于当前 session 且名称仍为空才写入。
- 用带当前 `sessionId` 的 `my-session-name-attempt` custom entry 持久化“已尝试”状态，避免 `/reload` 对同一 session 重试。fork 只接受匹配子 sessionId 的 marker。

## Testing Decisions

测试以下公共行为接缝：

1. **标题纯函数 seam**：首条用户消息提取、标题严格校验、子 `sessionId` 的 6 位小写 hash、fork 名称组合。
2. **扩展生命周期 seam**：模拟 `ExtensionAPI` 注册的 `input`、`before_agent_start`、`session_start` handlers，观察命名触发、source 过滤、人工名称优先、fork 后缀和旧 session 补命名。
3. **标题模型 seam**：mock `ctx.modelRegistry` 和 `completeSimple`，验证成功、空/非法输出、异常和后台不阻塞行为。

## Out of Scope

- 修改 Pi 的 `sessionId`、session selector、`/name` 命令或后台 subagent 的名称。
- 持续根据后续对话更新标题。
- 标题模型配置 UI、自动选择其他模型或隐私内容检测。
- 标题失败重试、用户通知、持久化额外来源标记。
