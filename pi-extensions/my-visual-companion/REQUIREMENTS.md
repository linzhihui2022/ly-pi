# my-visual-companion 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

为 Pi 提供浏览器中的可视化伴随界面，让助手在对话中展示 mockup、图表和结构化选择，并通过 Pi 工具读取用户在浏览器里的交互结果。

## 功能需求

1. `visual_companion_start` 启动本地 HTTP/WebSocket 服务，并返回 session URL。
2. `visual_companion_show` 将 HTML fragment 或完整 HTML document 推送到浏览器，并刷新页面。
3. `visual_companion_wait` 阻塞直到用户点击确认按钮，然后返回 confirm event。
4. `visual_companion_read_events` 返回当前 session 记录的 click/confirm events。
5. `visual_companion_stop` 关闭服务并释放资源。

### Slash 命令

1. `/vc-start` 启动一个 Visual Companion 浏览器会话，等效于调用 `visual_companion_start` 工具。
2. `/vc-show <session_id> <name> <html>` 推送 HTML 屏幕到浏览器，等效于调用 `visual_companion_show` 工具。
3. `/vc-wait <session_id>` 阻塞等待用户确认，等效于调用 `visual_companion_wait` 工具。
4. `/vc-events <session_id>` 读取会话事件，等效于调用 `visual_companion_read_events` 工具。
5. `/vc-stop <session_id>` 关闭会话，等效于调用 `visual_companion_stop` 工具。

## 安全需求

1. VC-SEC-1：每个 session 必须生成加密随机 session key。
2. VC-SEC-2：`visual_companion_start` 返回的 URL 必须包含 session key（`?key=...`）。
3. VC-SEC-3：HTTP `/` 和 `/files/*` 请求必须拒绝无有效 session key 的访问。
4. VC-SEC-4：WebSocket upgrade 必须拒绝无有效 session key 的连接。
5. VC-SEC-5：浏览器必须记住 key（cookie 或 query param），让 reload 和 `/helper.js` 在首次校验后继续工作。
6. VC-SEC-6：session key 不得仅凭 port 或 session id 推测。

## 持久化需求

1. VC-PER-1：每个 session 必须将事件流持久化到工作树 `.lychee/visual-companion/<session-id>/events.jsonl`。
2. VC-PER-2：事件必须按顺序追加，每行一个 JSON object。
3. VC-PER-3：新 screen 必须清空内存事件缓冲；持久化文件的保留或轮转策略由 `SPEC.md` 定义。
4. VC-PER-4：无法确定项目 root 时，允许回退到临时目录或仅保留内存事件。
5. VC-PER-5：session workspace 目录必须自动被 git 忽略。

## 非功能需求

1. 本地服务仅面向 `localhost`/`127.0.0.1` 使用场景。
2. 工具返回值需要包含可读文本和结构化 `details`。
3. 单元测试覆盖 API、server、session、tools 和入口注册行为。
4. 构建命令：`bunx turbo run build`。
5. 测试命令：`bunx turbo run test` 或在扩展目录执行 `vitest run`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 将 screen HTML 持久化为 `*.html` 文件 | 当前只持久化事件流 |
| 支持跨机器访问 | 当前仅支持本机浏览器协作 |
| 自动打开用户浏览器 | 由用户手动打开返回的 URL |
| 绑定 Pi 用户身份认证 | session key 已满足当前本地安全模型 |

## 验收标准

1. 启动后返回带 key 的 session URL。
2. 无 key 或 key 不匹配的 HTTP/WebSocket 访问被拒绝。
3. 推送新 screen 后浏览器能刷新到最新内容。
4. click/confirm events 同步写入内存和 `events.jsonl`。
5. 新 screen 会清空内存事件并按 `SPEC.md` 处理持久化文件。
6. `visual_companion_wait` 只在 confirm event 到达时解析。
7. 单元测试和覆盖率检查通过。
