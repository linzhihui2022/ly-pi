# `/back` 指令需求文档

## 目标

在 Pi 中新增一个 slash 命令 `/back`，用于快速撤销最近一条用户消息，并将其文本放回编辑器供修改后重新发送。

## 功能需求

1. 仅在 TUI 模式（`ctx.mode === "tui"`）下可用。
2. 当 agent 不空闲时，提示用户先中断当前操作。
3. 找到当前分支上最近一条 `type === "message" && role === "user"` 的 entry。
4. 若找不到用户消息，提示“没有可回退的用户消息”。
5. 若该用户消息已是当前会话 leaf（之后无内容），提示“上一条消息之后没有可回退的内容”。
6. 调用 `ctx.navigateTree(entry.id, { summarize: false })` 回退会话树。
7. 若 `navigateTree` 返回 `cancelled: true`，提示“已取消回退”。
8. 使用 `ctx.ui.setEditorText()` 将旧消息文本写入编辑器，**覆盖**当前编辑器内容。
9. 若旧消息包含图片，仅恢复文本，并提示用户“图片附件未恢复”。
10. 成功回退后保持静默，不显示额外成功提示。
11. 对 `/back` 后的多余参数（如 `/back 2`）静默忽略，仍执行单次回退。
12. 其他异常通过 `ctx.ui.notify()` 报告错误信息。

## 非功能需求

1. 扩展遵循 TDD 流程，测试覆盖率 branches/functions/lines/statements 全部 100%。
2. 排除项：`types.ts`、集成测试入口 `index.ts`。
3. 仅依赖 `@earendil-works/pi-coding-agent` 提供的类型与 API。

## 不做什么

- 不回退系统事件（模型切换、思考级别变化、compaction 等）。
- 不回退非用户消息触发的分支（如 `/goal` 等扩展注入的 `custom_message`）。
- 不在 agent 运行时强制中断并回退。
- 不支持 `/back N` 一次性回退多条消息。
- 不回退图片附件内容（仅恢复文本）。
- 不在 print/rpc/json 等非 TUI 模式下提供该命令。
