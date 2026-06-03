# Visual Companion Extension — Backlog

> 基于 [设计文档](../designs/2026-06-03-visual-companion-design.md) 与当前实现的差距记录。
> Date: 2026-06-03

---

## 1. 自动打开浏览器

**设计目标：** 首次 `show()` 时自动打开用户默认浏览器，无需手动复制 URL。

**实现位置：** `pi-extensions/my-visual-companion/api.ts` → `start()` 或 `show()`

**平台命令：**
- macOS: `open <url>`
- Linux: `xdg-open <url>`
- Windows: `start <url>`

**实现建议：**
```typescript
import { exec } from "node:child_process";

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? `open "${url}"`
    : platform === "linux" ? `xdg-open "${url}"`
    : platform === "win32" ? `start "${url}"`
    : null;
  if (cmd) exec(cmd, (err) => { /* silently ignore errors */ });
}
```

**降级策略：** 打开失败时静默忽略，用户可手动打开 URL（已在文档中说明）。

---

## 2. 自动焦点切回 pi 终端

**设计目标：** 用户在浏览器中点击 confirm 后，自动将窗口焦点切回 pi 所在的终端应用。

**实现位置：**
- `pi-extensions/my-visual-companion/server.ts` — WebSocket `confirm` 事件处理器中触发
- `pi-extensions/my-visual-companion/api.ts` — 提供 `focusTerminal()` 方法

**平台命令：**
- macOS: `osascript -e 'tell application "<focusApp>" to activate'`
- Linux: `wmctrl -a <focusApp>` 或 `xdotool search --class <focusApp> windowfocus`
- Windows: `powershell -Command "Add-Type ... [user32]::SetForegroundWindow(...)"`（较复杂）

**配置来源：** `my-visual-companion.json` → `focusApp`（默认 `"WezTerm"`）

**实现建议：**
```typescript
function focusTerminal(focusApp: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin"
    ? `osascript -e 'tell application "${focusApp}" to activate'`
    : platform === "linux"
    ? `wmctrl -a "${focusApp}" || xdotool search --class "${focusApp}" windowfocus`
    : null;
  if (cmd) exec(cmd, (err) => { /* silently ignore — fallback to system notification */ });
}
```

**降级策略：** 焦点切换失败时，通过 `ctx.ui.notify()` 发送系统通知提示用户。

---

## 3. uncaughtException 兜底清理

**设计目标：** pi 进程异常退出前，确保所有 Visual Companion session 被正确释放，避免端口泄漏。

**实现位置：** `pi-extensions/my-visual-companion/index.ts` 扩展入口处注册

**设计参考：**
```typescript
process.on("uncaughtException", () => {
  api.stopAll();
});
```

**注意事项：**
- 需权衡：`uncaughtException` 处理器会改变进程默认行为（不退出）
- 更安全的做法：在 `session_shutdown` 和 `beforeExit` 事件中清理
- 当前已实现 `session_shutdown` → `manager.destroyAll()`

---

## 4. 多 session 服务器隔离（架构优化）

**当前现状：** `server.ts` 中每个 server 实例用闭包变量 `sessionId` 追踪所属 session，但通过 `manager.updateScreen` monkey-patch 实现 reload 广播。当多个 session 并存时，所有 server 共享同一个 `manager.updateScreen` 方法，可能产生交叉广播。

**潜在问题：** 如果有 2 个活跃 session，`session A` 的 `updateScreen` 广播可能会发送到 `session B` 的 WebSocket 客户端（因为广播用的是 `wss.clients`，而 wss 是每个 session 独立的，但 monkey-patch 覆盖了同一个方法引用）。

**建议修复：** 不通过 monkey-patch 实现广播，而是在 `SessionManager.updateScreen` 中 emit 事件，或由 `api.ts` 的 `show()` 在调用 `manager.updateScreen()` 后主动触发广播。

---

## 优先级建议

| 优先级 | 功能 | 原因 |
|--------|------|------|
| P1 | 自动打开浏览器 | 直接影响用户体验，每次都要手动开浏览器 |
| P2 | 焦点切回终端 | 提升交互流畅度，减少用户窗口切换操作 |
| P3 | 多 session 广播隔离 | 当前单用户使用无影响，扩展后才需修复 |
| P4 | uncaughtException 兜底 | 已有 `session_shutdown` 覆盖正常退出路径 |
