# my-visual-companion 规格文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

为 Pi 提供浏览器中的可视化伴随界面，让助手在对话中展示 mockup、图表和结构化选择，并通过 Pi 工具读取用户在浏览器里的交互结果。

## 2. 模块结构

```
pi-extensions/my-visual-companion/
├── index.ts              # 扩展入口：注册 visual_companion_* 工具
├── server.ts             # HTTP / WebSocket 服务器
├── session.ts            # Session 管理与事件持久化
├── tools.ts              # 工具定义与执行逻辑
├── types.ts              # 共享类型
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── my-visual-companion.json    # 配置占位
├── SPEC.md               # 本文档
└── REQUIREMENTS.md       # 需求清单
```

依赖方向：

```
index.ts → tools.ts → server.ts → session.ts → types.ts
```

## 3. Session key 设计

- `visual_companion_start` 创建 session 时生成 32 字节 URL-safe base64 随机 key。
- `visual_companion_start` 返回的公开 URL 格式为 `http://<host>:<port>/?key=<key>`。
- HTTP handler 对每个请求校验 key：
  - `/` 与 `/files/*` 必须携带与 session key 匹配的 `key` query param。
  - key 缺失或不匹配返回 `403 Forbidden`。
- WebSocket upgrade 同样需要 key：
  - `ws://host:port/?key=<key>` 被接受。
  - 无有效 key 的连接立即终止。
- 浏览器通过名为 `vc_key` 的 cookie 在同源范围内记住 key；首次校验通过后，后续请求与 WebSocket 连接可自动使用 cookie。
- `/helper.js` 同样受保护：脚本请求必须包含 key。由于 script 标签无法动态携带 query param，helper 脚本读取 cookie 并在 WebSocket 连接 URL 中带上 key。若 `/helper.js` 无 key，服务器返回 `403`；当页面本身通过 `?key=...` 加载时，浏览器会回退到使用 query string 加载 helper。

## 4. 事件持久化设计

- 工作树 workspace 目录：`<repo-root>/.lychee/visual-companion/<session-id>/`。
- 目录内部：
  - `events.jsonl` — 当前/最近 screen 的只追加事件流。
  - `.gitignore` 内容为 `*`，使整个目录被 git 忽略。
- `SessionManager.appendEvent` 同时写入内存数组与文件。
- 新 screen（`updateScreen`）时清空内存事件缓冲，并截断文件，使持久化流仅反映当前 screen。
- 若 `git rev-parse --show-toplevel` 失败，workspace 回退到 `os.tmpdir()/.lychee/visual-companion/<session-id>/`。
- session stop 删除内存事件并可选移除 workspace 目录。默认保留文件，以便崩溃后保留审计数据；`visual_companion_stop` 不删除目录。

## 5. 时序图

```
LLM -> visual_companion_start
  <- { sessionId, port, url }

LLM -> visual_companion_show(name, html)
  -> 清空内存事件，截断 events.jsonl
  -> 通过 WebSocket 广播刷新

浏览器加载 /?key=...
  -> 服务器校验 key，返回 frame 包裹的 HTML
  -> helper.js 读取 cookie，连接 ws://host/?key=...

用户点击选项
  -> helper 通过 WS 发送 click 事件并携带 key
  -> 服务器校验 key，追加到 events.jsonl

用户点击确认
  -> helper 发送 confirm 事件
  -> 服务器解析 visual_companion_wait

LLM -> visual_companion_read_events
  <- 从 events.jsonl 读取事件
```

## 6. 工具行为

| 工具 | 行为 |
|------|------|
| `visual_companion_start` | 启动本地 HTTP/WebSocket 服务，返回 session URL |
| `visual_companion_show` | 推送 HTML fragment 或完整 document 到浏览器并刷新 |
| `visual_companion_wait` | 阻塞直到用户点击确认按钮，返回 confirm event |
| `visual_companion_read_events` | 返回当前 session 记录的 click/confirm events |
| `visual_companion_stop` | 关闭服务并释放资源 |

## 7. 测试策略

- `server.ts`：HTTP 路由、WebSocket 升级、session key 校验测试。
- `session.ts`：事件追加、新 screen 截断、目录回退逻辑测试。
- `tools.ts`：各工具执行与返回结构测试。
- `index.ts`：集成测试，mock ExtensionAPI、HTTP 服务器与文件系统。
- 覆盖率目标：`branches / functions / lines / statements` 全部 100%。
- 排除：`types.ts`（纯类型）、`index.ts`（集成入口）。

## 8. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 将 screen HTML 持久化为 `*.html` 文件 | 当前只持久化事件流 |
| 支持跨机器访问 | 当前仅支持本机浏览器协作 |
| 自动打开用户浏览器 | 由用户手动打开返回的 URL |
| 绑定 Pi 用户身份认证 | session key 已满足当前本地安全模型 |

## 9. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 整理 visual companion 规格文档，翻译为中文并补充模块结构、时序图、测试策略与变更日志 |
