import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
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
