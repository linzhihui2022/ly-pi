# Visual Companion Pi Extension — Design Document

Date: 2026-06-03

## Overview

将 `pi-skills/brainstorming` 中的 Visual Companion server 重构为一个 pi extension，替代原有的 shell 脚本启动方式，提供 LLM Tool + 内部 API 的统一接口。

## Goals

- 自动集成到 brainstorming 流程 + 提供独立 slash 命令
- 替代现有的 `start-server.sh` / `stop-server.sh`
- 内嵌服务器逻辑到扩展中（Node.js `http` + `ws` 库）
- 暴露 LLM Tool + 内部 API
- 自动打开浏览器、自动焦点切回 pi
- **零内存泄漏**

## Non-Goals

- 支持远程访问（仅 localhost）
- 替换 brainstorming skill 的设计流程
- 持久化 session 到磁盘（纯内存管理）

## Architecture

```
┌─────────────────────┐
│  Brainstorming      │
│  Skill / LLM        │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  ToolRegistry       │  visual_companion_start/show/read_events/stop
│  (tools.ts)         │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  VisualCompanionAPI │  start(), show(), events(), stop()
│  (api.ts)           │
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  SessionManager     │  Map<sessionId, Session>
│  (session.ts)       │  空闲超时、内存清理
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Server             │  HTTP + WebSocket (ws 库)
│  (server.ts)        │  /, /files/*, WebSocket broadcast
└─────────────────────┘
          │
          ▼
    ┌──────────┐
    │ Browser  │  frame.html + helper.js
    └──────────┘
```

## Component Breakdown

### `index.ts` — Extension Entry

- 注册 `session_start` / `session_shutdown` 事件处理器
- 注册 4 个 slash 命令
- 注册 4 个 LLM tools
- 初始化 `VisualCompanionAPI`

### `server.ts` — HTTP/WebSocket Server

- 使用 Node.js `http` 模块 + `ws` 库
- 路由 `/`：返回当前 active screen（注入 helper.js）
- 路由 `/files/<name>`：返回内存中的静态资源
- WebSocket：广播 `reload` 消息，接收 `click`/`confirm` 事件
- 端口：动态分配（`49152 + random`，冲突时重试）
- 空闲超时：30 分钟自动关闭

### `session.ts` — SessionManager

```typescript
interface Session {
  id: string;
  port: number;
  url: string;
  server: Server;              // http server instance
  wss: WebSocketServer;        // ws server instance
  screens: Map<string, Screen>;
  events: Event[];
  activeScreen: string | null;
  lastActivity: number;
  idleTimer: NodeJS.Timeout | null;
}
```

WebSocket 连接通过 `wss.clients`（`ws` 库内置的 Set）统一追踪，无需额外数据结构。

### `api.ts` — VisualCompanionAPI

```typescript
interface VisualCompanionAPI {
  start(): Promise<SessionInfo>;
  show(sessionId: string, name: string, html: string): Promise<void>;
  events(sessionId: string): Promise<Event[]>;
  stop(sessionId: string): Promise<void>;
  stopAll(): Promise<void>;
}
```

`start()` 不再需要 `projectDir`（纯内存管理，无文件系统持久化）。

### `tools.ts` — LLM Tool Registry

| Tool | 功能 |
|------|------|
| `visual_companion_start` | 启动 Visual Companion 会话 |
| `visual_companion_show` | 推送 screen 到浏览器 |
| `visual_companion_read_events` | 读取用户 click/confirm 事件 |
| `visual_companion_stop` | 关闭会话 |

### Browser Assets

- **`frame.html`**：从原 `frame-template.html` 移植
- **`helper.js`**：从原 `helper.js` 移植，WebSocket 自动重连、事件发送、confirm 处理
- **注入方式**：`server.ts` 在返回 HTML 响应时，在 `</body>` 前注入 `<script src="/helper.js"></script>`

## Data Flow

```
Skill calls visual_companion_start()
  → API.start() → SessionManager.create() → Server.listen()
  → auto-open browser (os-specific command)
  → return {sessionId, port, url}

Skill calls visual_companion_show(html)
  → API.show() → SessionManager.updateScreen()
  → clear events, reset idle timer
  → WebSocket broadcast "reload" → Browser updates

User clicks in browser
  → helper.js sends ws message
  → Server pushes to session.events[]

Skill calls visual_companion_read_events()
  → return session.events

User confirms
  → helper.js sends "confirm"
  → Server pushes to session.events[]
  → auto-focus pi terminal

Skill calls visual_companion_stop()
  → API.stop() → SessionManager.destroy()
  → close server, clear timers, remove from Map
```

## Memory Management (Anti-Leak)

### 1. Session Lifecycle

```typescript
// 创建
const session = new Session(id, port, server, wss);
sessions.set(id, session);

// 销毁 —— 必须按顺序清理
session.idleTimer && clearTimeout(session.idleTimer);
session.wss.clients.forEach((ws: WebSocket) => ws.terminate());  // 强制关闭所有 WebSocket
session.wss.close();
session.server.close();
sessions.delete(id);                                  // 从 Map 移除
// 不再持有 session 引用，等待 GC
```

### 2. WebSocket 连接追踪

- 通过 `wss.clients`（`ws` 库内置的 Set）追踪所有活跃连接
- `stop()` 时遍历 `wss.clients` 调用 `ws.terminate()`

### 3. 定时器管理

- `idleTimer`：每次 `show()` 或收到事件时 `clearTimeout` + `setTimeout`
- `stop()` 时 `clearTimeout`
- `session_shutdown` 时遍历所有 session 调用 `stop()`

### 4. 事件数组

- 每次 `show()` 执行 `session.events = []`（不 push 到旧数组）
- `stop()` 时 `session.events = []`

### 5. 服务器关闭

- `server.close()`：停止接受新连接
- `wss.close()`：关闭 WebSocket 服务器
- 等待现有连接关闭或超时（`ws.terminate()` 强制）

### 6. 错误场景兜底

```typescript
process.on('uncaughtException', (err) => {
  api.stopAll();  // 紧急清理所有 session
});
```

## Error Handling

| 场景 | 处理方式 |
|------|----------|
| 端口被占用 | 自动尝试下一个端口 |
| 浏览器打开失败 | 静默降级，用户手动打开 URL |
| 焦点切换失败 | 静默降级，系统通知提示 |
| WebSocket 断连 | helper.js 自动重连（1s 间隔） |
| 30 分钟空闲 | SessionManager 自动 `stop()` |
| session_id 不存在 | Tool 返回 `{error: "Session not found"}` |
| 重复 show 同名 screen | 覆盖旧内容，清空 events，重置定时器 |
| pi 进程退出 | `session_shutdown` → `stopAll()` |

## Auto Browser & Focus

### 自动打开浏览器

首次 `show()` 时：
- macOS: `open <url>`
- Linux: `xdg-open <url>`
- Windows: `start <url>`

### 自动焦点切回 pi

用户 confirm 后：
- macOS: `osascript -e 'tell application "<focusApp>" to activate'`
- Linux: `wmctrl -a <focusApp>` 或 `xdotool search --class <focusApp> windowfocus`
- 配置项 `visual-companion.json` → `focusApp`
- 失败时发送系统通知

## Configuration

`pi-extensions/my-visual-companion.json`：

```json
{
  "focusApp": "WezTerm",
  "defaultHost": "127.0.0.1",
  "defaultUrlHost": "localhost",
  "idleTimeoutMinutes": 30
}
```

## Testing Strategy

TDD，100% 覆盖率（`types.ts` / `index.ts` 除外）。

| 模块 | 测试重点 |
|------|----------|
| `session.ts` | create/destroy、事件追加/清空、空闲超时触发、内存泄漏验证 |
| `api.ts` | 接口映射、错误传播、stopAll 清理 |
| `server.ts` | HTTP 路由、WebSocket 广播、端口冲突重试 |
| `tools.ts` | tool 参数解析、返回值格式 |

关键测试用例：
- `show()` 后 events 自动清空
- 空闲 30 分钟后 session 自动销毁，Map 中无残留
- `stop()` 后 WebSocket 连接全部关闭
- `stopAll()` 后所有 session 被清理

## Skill Usage Documentation

`visual-companion.md` 放置于扩展目录，内容包含：

- **何时使用 Visual Companion**：浏览器 vs 终端决策
- **Tool 列表与参数说明**：start / show / read_events / stop
- **HTML fragment 规范**：语义文件名、不重用文件名、data-choice / data-multiselect
- **事件读取流程**：write screen → wait for user → read events → parse confirm
- **最佳实践**：每个问题独立 screen、confirm 优先于 click、30 分钟超时
- **限制**：仅 localhost、单浏览器、单用户交互

## File Layout

```
pi-extensions/my-visual-companion/
├── index.ts              # 入口
├── server.ts             # HTTP + WebSocket server
├── session.ts            # SessionManager
├── api.ts                # VisualCompanionAPI
├── tools.ts              # LLM tool 注册
├── types.ts              # TypeScript 类型
├── frame.html            # 浏览器 frame 模板
├── helper.js             # 客户端脚本
├── index.test.ts         # 测试
├── package.json          # 依赖 ws
└── visual-companion.md   # Skill 使用文档
```

## Dependencies

- `ws` (^8.x) — WebSocket 服务器/客户端
- 无其他运行时依赖

## Migration Notes

- `brainstorming` skill 移除 `scripts/server.cjs`、`start-server.sh`、`stop-server.sh`
- skill 改为调用 `visual_companion_*` tools
- `frame-template.html` → `frame.html`（内容基本不变）
- `helper.js` 内容基本不变，仅需调整 WebSocket URL（相对路径）
