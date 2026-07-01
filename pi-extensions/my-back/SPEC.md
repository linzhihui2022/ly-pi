# `/back` 指令规格文档

## 模块结构

```
pi-extensions/my-back/
├── index.ts          # 注册 /back 命令，实现 handler
├── index.test.ts     # 命令 handler 集成测试
├── back.test.ts      # 纯函数 findLastUserMessageEntry 测试
├── back.ts           # 核心纯逻辑
├── package.json
├── tsconfig.json
└── my-back.json      # 空扩展配置
```

## 核心接口

### `back.ts`

```typescript
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

export type UserMessageEntry = SessionMessageEntry & { message: UserMessage };

export function findLastUserMessageEntry(
  branch: SessionEntry[],
): UserMessageEntry | undefined;
```

- 输入：当前分支的 entry 数组（时间顺序）。
- 输出：最后一条 `type === "message" && message.role === "user"` 的 entry；若无则返回 `undefined`。

### `index.ts`

注册 `back` 命令，handler 按以下顺序执行：

1. 断言 `ctx.mode === "tui"`；否则 `notify("warning", "/back 仅在交互模式下可用")` 并返回。
2. 断言 `ctx.isIdle()`；否则 `notify("warning", "请先中断当前操作，再执行 /back")` 并返回。
3. 调用 `findLastUserMessageEntry(ctx.sessionManager.getBranch())`。
4. 若未找到，提示 `notify("info", "没有可回退的用户消息")` 并返回。
5. 若找到但 `entry.id === ctx.sessionManager.getLeafId()`，提示 `notify("info", "上一条消息之后没有可回退的内容")` 并返回。
6. 调用 `await ctx.navigateTree(entry.id, { summarize: false })`。
7. 若返回 `cancelled: true`，提示 `notify("info", "已取消回退")` 并返回。
8. 从 `entry.message.content` 提取文本：字符串直接写入；数组取 `type === "text"` 项拼接。调用 `ctx.ui.setEditorText(text)` 覆盖编辑器文本。
9. 若 entry 包含图片（`content` 为数组且其中存在 `type === "image"` 项），提示 `notify("info", "图片附件未恢复，仅文本已放回编辑器")`。
10. 成功路径静默完成。

## 错误处理

- `navigateTree` 抛异常：catch 后 `notify("error", err.message)`。
- handler 自身抛异常：由 Pi 的 extension runner 统一处理；测试中验证 notify 调用。

## 测试规格

### `back.test.ts`

1. 空数组返回 `undefined`。
2. 只有 assistant message 时返回 `undefined`。
3. 找到最后一条 user message。
4. user message 位于 branch 中间时正确返回。
5. user message 为第一条 entry 时正确返回。
6. 忽略 `toolResult`、`custom`、`custom_message` 等非用户消息 entry。

### `index.test.ts`

1. 非 tui 模式拒绝并提示。
2. agent 不 idle 时拒绝并提示。
3. 无 user message 时提示。
4. user message 已是 leaf 时提示。
5. 成功回退时调用 `navigateTree` 参数正确。
6. `navigateTree` 取消时提示。
7. `navigateTree` 抛异常时提示错误。
8. 成功回退且消息含图片时，调用 `setEditorText` 并提示图片未恢复。
9. 成功回退且消息纯文本时，调用 `setEditorText` 且不提示成功。
