# 02 — 完成即收：一次 Tool Run 只留一行摘要

**What to build:** 用户发出消息后，工具执行过程不再占满会话。一次 Tool Run（从该条用户消息到该次回答结束）在会话里只留一条 Run Summary Row，形如 `⚙ 12 calls · 1m42s`；期间只有 Live Tool Row（正在执行的那条）可见，每条工具行在自己的执行结束时立即消失，不留空行。按 `ctrl+o` 可以把所有 run 的所有输出拉回来。本票让折叠与全局展开先完整可用；失败的行此时仍保持可见，由 03 翻转为收起并给出提示。

**Blocked by:** 01 — 壳层切换：让隐藏行真能零高度

**Status:** claimed

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] Tool Run 的第一条 Tool Row 充当 Run Summary Row，显示调用计数与本次运行耗时，末尾附键位提示
- [ ] Live Tool Row 在 run 期间保持可见并沿用现有输出规则；其余已完成行不占任何行高（含分隔空行）
- [ ] `ctrl+o` 全局展开时所有 run 的所有行按现有逻辑呈现；run 级折叠不得吞掉原生展开
- [ ] 折叠与展开完全由 `ctrl+o` 决定，不引入 run 级展开状态
- [ ] 无工具调用的回答不产生摘要行；同一会话的多个 Tool Run 各自独立计数与计时
- [ ] 折叠核心以不依赖 TUI 的纯逻辑单测覆盖：run 边界识别（一个 run 内的多个 turn）、完成即收、计数、耗时、全局展开覆盖
- [ ] 渲染契约测试覆盖：摘要行文案、Live 行实时输出、隐藏行渲染为空
- [ ] 非交互模式无副作用；`/reload` 后不重复注册、不重复订阅、不留残计时；已有外部所有者的工具不被抢占
- [ ] `bun run verify` 通过；真实 TUI 手动确认完成即收与 `ctrl+o` 拉回

## Comments

### 2026-09-18 — 实施计划（开工前记录）

1. **折叠核心（纯逻辑，S1）**：一个不依赖 TUI 的 `ToolRunFold`，输入 agent 生命周期事件（`agent_start` / `agent_end`）与工具事件（`tool_execution_start` / `tool_execution_end` 及失败标记），按 `toolCallId` 把工具行归属到 Tool Run；输出每行的呈现种类（`hidden` / `live` / `summary` / `normal`）与摘要文案（计数、耗时、失败计数）。不渲染任何东西。
2. **呈现规则**：全局展开（`context.expanded`）时一律走现有逻辑（`normal`），折叠完全让位；否则正在执行的那条工具行为 `live`，run 的第一条工具行在**自身执行期间**是 `live`、执行结束后变成 `summary`，其余行 `hidden`。摘要内容为 `⚙ <N> calls · <耗时>` 加暗色 `ctrl+o` 键位提示（`keyHint("app.tools.expand", ...)`，跟随用户改键）。
3. **行重渲染**：模块按 `toolCallId` 记住每行的 `invalidate`（来自行级渲染上下文），在 run 内呈现发生变化（工具开始/结束、run 结束）时主动 invalidate 相关行；run 结束后释放记录。不依赖 Pi 是否会额外重渲染旧行。
4. **计时**：run 活动期间每秒 invalidate 一次摘要行（与 Pi bash 行 `Elapsed` 计时同一做法，用定时器），run 结束时清掉定时器，不留残留计时。
5. **生命周期**：状态按 Pi 实例持有（沿用现有 `WeakSet` / `WeakMap` 模式）并在 `session_start` 重置；`/reload`、会话切换与非 TUI 模式都不留下订阅或定时器。
