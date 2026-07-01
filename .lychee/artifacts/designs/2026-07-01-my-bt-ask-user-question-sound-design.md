# my-bt ask_user_question 声音支持设计

## 背景

`my-bt` 扩展当前只在 pi 生命周期事件（`session_start`、`agent_start`、`agent_end`）和权限事件上播放语音。用户希望在 Pi 调用 `ask_user_question` 工具时也能听到提示音，以便及时注意到需要交互的问题。

## 问题

`ask_user_question` 不是 pi 的独立生命周期事件，而是通过 `tool_call` 事件触发的一个工具调用。`tool_call` 事件会覆盖所有工具调用（`bash`、`read`、`write`、`edit`、`ask_user_question` 等），因此不能简单地把 `eventMap` 中的 `"tool_call"` 映射到某个分类，否则所有工具调用都会发声。

## 方案

引入独立的 `toolEventMap` 配置，专门做“工具名 → 声音分类”的精确映射。同时在代码中单独监听 `tool_call` 事件，根据 `event.toolName` 判断是否命中 `toolEventMap`。

## 配置变更

### 新增分类

```json
"question": {
  "description": "提问 / 需要用户确认",
  "files": ["你还好吗.wav"]
}
```

### 新增工具事件映射

```json
"toolEventMap": {
  "ask_user_question": "question"
}
```

### 新增浮层文案

```json
"overlayTextMap": {
  "ask_user_question": {
    "type": "QUESTION",
    "title": "侦测到提问",
    "subtitle": "BT-7274 需要你的反馈"
  }
}
```

## 代码变更

### `types.ts`

在 `BtConfig` 中添加可选字段：

```typescript
toolEventMap?: Record<string, string>;
```

### `index.ts`

1. 订阅 `tool_call` 事件。
2. 当事件触发时，检查 `event.toolName` 是否存在于 `config.toolEventMap` 中。
3. 命中时，使用映射的分类调用 `playCategory()` 播放声音。
4. 同时调用 `playOverlay()`，事件名使用 `ask_user_question` 以匹配 `overlayTextMap`。

实现要点：
- `tool_call` 事件在工具执行前触发，播放声音为 fire-and-forget，不会阻塞工具执行。
- 使用 `ctx.ui.notify` 作为错误通知回调，与现有生命周期事件保持一致。
- 如果 `config.toolEventMap` 为空或未配置，则不订阅 `tool_call` 事件。

## 测试计划

1. `index.test.ts` 中新增测试：
   - 当 `toolEventMap` 包含 `ask_user_question` 时，调用对应 `playCategory`。
   - 当 `toolEventMap` 不包含当前工具名时，不播放声音。
   - 当 `toolEventMap` 未配置时，不订阅 `tool_call` 事件。
   - 当 `config.enabled` 为 `false` 时，不播放声音。

2. 运行全量测试，确保覆盖率保持 100%。

## 部署

1. 构建扩展：`bun run build`
2. 部署到 `~/.pi/agent/extensions/my-bt`：`bun run deploy`
3. 在 pi 中执行 `/reload`
