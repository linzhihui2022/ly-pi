# my-back 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

在 Pi 中新增 slash 命令 `/back`，用于快速撤销最近一条用户消息，并将该消息的文本放回编辑器，供用户修改后重新发送。

## 功能需求

1. `/back` 仅在 TUI 模式（`ctx.mode === "tui"`）下可用。
2. agent 不空闲时，提示用户先中断当前操作。
3. 从当前会话分支中找到最近一条 `type === "message" && role === "user"` 的 entry。
4. 找不到用户消息时，提示“没有可回退的用户消息”。
5. 最近用户消息已经是当前会话 leaf 时，提示“上一条消息之后没有可回退的内容”。
6. 调用 `ctx.navigateTree(entry.id, { summarize: false })` 回退会话树。
7. `navigateTree` 返回 `cancelled: true` 时，提示“已取消回退”。
8. 使用 `ctx.ui.setEditorText()` 将旧消息文本写入编辑器，并覆盖当前编辑器内容。
9. 旧消息包含图片时，只恢复文本，并提示“图片附件未恢复”。
10. 成功回退后保持静默，不显示额外成功提示。
11. `/back` 后的多余参数（如 `/back 2`）静默忽略，仍只执行单次回退。
12. 其他异常通过 `ctx.ui.notify()` 报告错误信息。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 测试覆盖率 branches/functions/lines/statements 全部 100%。
3. 覆盖率排除项：`types.ts` 和集成测试入口 `index.ts`。
4. 仅依赖 `@earendil-works/pi-coding-agent` 提供的类型与 API。
5. 构建命令：`bunx turbo run build`。
6. 测试命令：`bunx turbo run test` 或在扩展目录执行 `vitest run`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 回退系统事件（模型切换、思考级别变化、compaction 等） | `/back` 只处理用户消息 |
| 回退非用户消息触发的分支 | 例如 `/goal` 注入的 `custom_message` 不属于用户消息 |
| agent 运行时强制中断并回退 | 避免破坏正在进行的操作 |
| 支持 `/back N` 一次性回退多条消息 | 当前只做最近一条用户消息 |
| 恢复图片附件内容 | 当前仅恢复文本 |
| 在 print/rpc/json 等非 TUI 模式下提供命令 | 依赖 TUI 编辑器 |

## 验收标准

1. 非 TUI、agent 忙碌、无用户消息、leaf 已是用户消息、取消回退、异常路径都有明确通知。
2. 成功路径调用 `navigateTree(entry.id, { summarize: false })`。
3. 成功路径将旧用户消息文本覆盖写回编辑器。
4. 旧消息含图片时只恢复文本并提示附件未恢复。
5. 成功路径不显示额外成功提示。
6. 单元测试和覆盖率检查通过。

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 确认 `/back` 需求、验收标准与排除项，建立需求基线 |
