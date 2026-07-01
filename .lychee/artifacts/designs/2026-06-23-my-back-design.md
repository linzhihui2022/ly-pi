# `/back` 指令设计文档

日期：2026-06-23

## 背景

用户经常在发送消息给 pi agent 后发现自己打错字，希望有一种快速方式撤销刚刚发送的消息并重新编辑。Pi 自带的 `/tree` 虽然可以导航历史，但步骤较多，不适合这种高频、紧急的纠正场景。

## 目标

新增一个 `/back` slash 命令。当 agent 空闲时，执行该命令会：

1. 找到当前分支上最近一条用户消息；
2. 撤销该消息及其之后的所有对话内容；
3. 将撤销的用户消息文本放回编辑器，供用户修改后重新发送。

## 非目标

- 不回退系统事件（模型切换、思考级别变化、compaction 等）。
- 不回退非用户消息触发的分支（如 `/goal` 等扩展注入的 `custom_message`）。
- 不在 agent 运行时强制中断并回退。
- 不支持 `/back N` 一次性回退多条消息。
- 不回退图片附件中的内容（文本恢复，图片丢失）。
- 不在 print/rpc/json 等非 TUI 模式下提供该命令。

## 行为定义

### 正常流程

1. 用户输入 `/back`；
2. 命令 handler 检查 `ctx.mode === "tui"`：
   - 若不是，提示 `/back 仅在交互模式下可用` 并返回；
3. 检查 `ctx.isIdle()`：
   - 若 `false`，提示 `请先中断当前操作，再执行 /back` 并返回；
4. 从 `ctx.sessionManager.getBranch()` 中从后向前查找 `type === "message" && message.role === "user"` 的 entry；
5. 若未找到，提示 `没有可回退的用户消息`，然后返回；
6. 若该 entry 已是当前 leaf，提示 `上一条消息之后没有可回退的内容`，然后返回；
7. 调用 `await ctx.navigateTree(entry.id, { summarize: false })`；
8. 若返回 `cancelled: true`，提示 `已取消回退` 并返回；
9. 调用 `ctx.ui.setEditorText(entry.message.content)` 覆盖编辑器文本；
10. 若该消息包含图片，提示 `图片附件未恢复，仅文本已放回编辑器`；
11. 否则静默完成。

### 边界与错误处理

| 场景 | 行为 |
|------|------|
| 非 TUI 模式 | `ctx.ui.notify("/back 仅在交互模式下可用", "warning")` |
| agent 不 idle | `ctx.ui.notify("请先中断当前操作，再执行 /back", "warning")` |
| 当前分支没有 user message | `ctx.ui.notify("没有可回退的用户消息", "info")` |
| 上一条 user message 已是 leaf | `ctx.ui.notify("上一条消息之后没有可回退的内容", "info")` |
| `navigateTree` 被取消 | `ctx.ui.notify("已取消回退", "info")` |
| user message 包含图片 | 只恢复文本，info 提示图片未恢复 |
| 其他异常 | catch 后 notify 错误信息 |
| 编辑器非空 | 用旧消息文本覆盖 |
| `/back` 带参数 | 静默忽略，仍执行单次回退 |

## 项目结构

新增扩展 `pi-extensions/my-back/`：

```
pi-extensions/my-back/
├── index.ts          # 注册 /back 命令
├── index.test.ts     # 命令集成测试
├── back.test.ts      # 纯函数测试
├── back.ts           # 核心逻辑
├── package.json
├── tsconfig.json
└── my-back.json      # 空扩展配置
```

## 核心模块

### `back.ts`

导出纯函数 `findLastUserMessageEntry`，输入 branch entry 数组，返回最近的用户 message entry 或 `undefined`。

```typescript
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

export function findLastUserMessageEntry(
  branch: SessionEntry[],
): SessionMessageEntry | undefined;
```

### `index.ts`

```typescript
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { findLastUserMessageEntry } from "./back";

export default function myBack(pi: ExtensionAPI): void {
  pi.registerCommand("back", {
    description: "撤销最近一条用户消息并放回编辑器",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/back 仅在交互模式下可用", "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("请先中断当前操作，再执行 /back", "warning");
        return;
      }

      const branch = ctx.sessionManager.getBranch();
      const entry = findLastUserMessageEntry(branch);
      if (!entry) {
        ctx.ui.notify("没有可回退的用户消息", "info");
        return;
      }

      const leafId = ctx.sessionManager.getLeafId();
      if (entry.id === leafId) {
        ctx.ui.notify("上一条消息之后没有可回退的内容", "info");
        return;
      }

      try {
        const result = await ctx.navigateTree(entry.id, { summarize: false });
        if (result.cancelled) {
          ctx.ui.notify("已取消回退", "info");
          return;
        }
      } catch (err) {
        ctx.ui.notify(
          err instanceof Error ? err.message : String(err),
          "error",
        );
        return;
      }

      const content = entry.message.content;
      const text = Array.isArray(content)
        ? content.map((c) => (c.type === "text" ? c.text : "")).join("")
        : content;
      ctx.ui.setEditorText(text);

      const hasImage =
        Array.isArray(content) && content.some((c) => c.type === "image");
      if (hasImage) {
        ctx.ui.notify("图片附件未恢复，仅文本已放回编辑器", "info");
      }
    },
  });
}
```

## 测试策略

覆盖率要求 branches/functions/lines/statements 100%。

### `back.test.ts`

- 正常找到最后一条 user message
- 忽略 assistant / toolResult / custom 等 entry
- 空数组返回 undefined
- user message 在 branch 中间的情况
- user message 为第一条 entry 的情况

### `index.test.ts`

- 非 interactive 模式拒绝并提示
- agent 不 idle 时拒绝并提示
- 无 user message 时提示
- user message 已是 leaf 时提示
- 成功回退时调用 `navigateTree` 且参数正确
- `navigateTree` 取消时提示
- `navigateTree` 抛异常时提示错误
- 成功回退且消息含图片时调用 `setEditorText` 并提示
- 成功回退纯文本时调用 `setEditorText` 且不提示成功

## 部署

扩展配置 `my-back.json` 为空对象 `{}`，通过 `install.sh` / `bun run deploy` 部署后，Pi 会在启动时自动加载 `/back` 命令。

## 依赖

- `@earendil-works/pi-coding-agent`：提供扩展 API、命令上下文、会话 entry 类型。
- `@earendil-works/pi-ai`：提供 `UserMessage` 类型，用于精确标注用户消息 entry。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `navigateTree` 对 user message 的自动恢复文本行为未来可能变化 | 集成测试覆盖该路径，行为变化会立即失败 |
| 命令与 Pi 未来内置的 `/back` 冲突 | Pi 允许多个扩展注册同名命令，会以 `:1` 后缀区分；设计简洁，便于后续迁移 |
| 多模态消息只恢复文本 | 在文档与提示中明确说明 |
