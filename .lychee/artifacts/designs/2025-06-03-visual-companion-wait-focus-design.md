# Visual Companion Wait + Focus 设计文档

## 背景与问题

当前 Visual Companion 流程：

1. `vc-show` 推送 HTML → agent 返回，用户看到浏览器页面
2. 用户点击确认 → 事件存入 `session.events` 数组
3. **agent 完全无感知**，必须用户回到终端发一条消息，agent 才会执行 `vc-read-events`

痛点：
- 用户在浏览器确认后，不知道接下来该做什么
- 必须手动"对话"触发下一轮，流程断裂

## 目标

1. **`visual_companion_wait`** — 阻塞等待用户确认，confirm 事件自动唤醒 agent
2. **`focusApp` 聚焦（可选）** — macOS 上收到 confirm 后，若配置了 `focusApp`，自动聚焦对应终端应用

## 非目标

- 跨平台聚焦（仅 macOS `osascript`）
- 支持多次 wait（单次 confirm 单次 wait）
- 等待 click 事件（仅 confirm）

## 方案：Promise + Resolver + WebSocket 回调

### 架构

```
Browser (helper.js)
  ↓ confirm 事件 via WebSocket
Server (wss.on message)
  ↓ JSON.parse
SessionManager.appendEvent()
  ├─ 存入 events 数组
  ├─ 发现 type === "confirm"
  │     ├─ 调用 waitResolver.resolve(event)
  │     └─ 调用 focusApplication() → osascript
  └─ resetIdleTimer()

visual_companion_wait (工具)
  ↓ 调用 sessionManager.waitForConfirm()
  │     ├─ 检查是否已有 confirm（防竞态）
  │     ├─ 注册 resolver
  │     └─ setTimeout 超时 reject
  ↓ 阻塞直到 resolved / timeout
```

### 改动清单

#### 1. `session.ts`

新增：

- `waitResolvers: Map<string, { resolve, reject }>` — 存储等待 confirm 的 Promise 回调
- `focusApp?: string` — 从配置传入，用于 osascript；未配置时不聚焦
- `waitForConfirm(id, timeoutMs): Promise<CompanionEvent>`
  - 先检查 events 数组是否已有 confirm（竞态防护）
  - 存储 resolve/reject 到 Map
  - timeout 后 reject 并清理 Map
- `appendEvent()` 修改：
  - `type === "confirm"` 时检查并调用 resolver
  - 调用 `focusApplication()`
- `focusApplication()` 私有方法：
  - 仅当 `focusApp` 已配置时执行
  - `execSync('osascript -e "tell application ... to activate"', { timeout: 5000 })`
  - 失败静默忽略；无 fallback 默认值

#### 2. `types.ts`

`VisualCompanionConfig.focusApp` 为可选字段。

#### 3. `api.ts`

新增：

- `wait(sessionId, timeoutMs): Promise<CompanionEvent>` — 代理到 `manager.waitForConfirm()`

修改：

- `show()` 返回类型已是 `{ url: string }`，无需改动

#### 4. `tools.ts`

新增工具：

```typescript
defineTool({
  name: "visual_companion_wait",
  label: "Wait for Confirm",
  description: "Wait for user to confirm a selection in the Visual Companion browser. Blocks until confirmed or timeout. Only returns on confirm events (click alone does not resolve).",
  parameters: Type.Object({
    session_id: Type.String({ description: "Session ID from visual_companion_start" }),
    timeout_ms: Type.Number({ default: 300000, description: "Maximum time to wait in milliseconds. Default 5 minutes." }),
  }),
  async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    try {
      const event = await api.wait(params.session_id, params.timeout_ms);
      return {
        content: [{ type: "text", text: `Confirmed: ${event.text || event.choice || "selection"}` }],
        details: { confirmed: true, event },
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        details: { error: err.message },
      };
    }
  },
});
```

修改现有工具数量：4 → 5

#### 5. `index.ts`

- 将 `focusApp` 从 `config` 传入 `SessionManager`
- 注册新工具 `visual_companion_wait`
- 注册新 slash 命令 `vc-wait`

#### 6. `server.ts`

无需改动。`appendEvent` 逻辑在 `SessionManager` 中处理。

#### 7. `helper.js`

无需改动。`confirm` 事件发送逻辑已正确。

### 数据流

```
Agent: vc-show → 推送页面 → 返回（非阻塞）
Agent: vc-wait  → 调用 waitForConfirm()
                    ├─ 已有 confirm? 立即返回
                    └─ 注册 resolver，等待 ...

User: 点击确认 → WebSocket msg → appendEvent()
                                    ├─ resolver.resolve(event)
                                    ├─ osascript focus
                                    └─ agent 继续执行
```

### 错误处理

| 场景 | 行为 |
|------|------|
| Session 不存在 | `waitForConfirm` 立即 reject "Session not found" |
| 超时（默认 5min） | reject "Timeout waiting for confirm"，清理 resolver |
| 聚焦失败 | 静默忽略，不影响 confirm 流程 |
| `focusApp` 未配置 | 跳过聚焦，不影响 confirm 流程 |
| 重复调用 wait | 第二个 wait 会替换第一个 resolver（第二个生效） |
| confirm 先于 wait | `waitForConfirm` 检查已有 events，立即返回 |

### 测试策略

1. `session.test.ts` — 新增 `waitForConfirm` 测试
2. `tools.test.ts` — 新增 `visual_companion_wait` 工具测试
3. `api.test.ts` — 新增 `wait()` 测试
4. `index.test.ts` — 验证注册 5 个工具

### 交互示例

```
Agent: /vc-start
→ Visual Companion started at http://localhost:50838 (session: xxx)

Agent: /vc-show xxx demo "<div class='options'>...</div>"
→ Screen "demo" shown. Open or refresh: http://localhost:50838

Agent: /vc-wait xxx
→ [阻塞，等待用户...]

User: [在浏览器点击选项 → 点击"确认"]
→ [若配置了 focusApp，osascript 聚焦对应应用]
→ [agent 自动继续]

Agent: Confirmed: 深色主题
```

## 边界条件

- `waitForConfirm` 在 confirm 之后、wait 之前被调用 → 检查 events 数组，立即返回
- `destroy` 被调用时存在 pending wait → resolver 应该被 reject
- `updateScreen` 清除 events → 不影响已 resolved 的 Promise，但新的 wait 会等待新 confirm
