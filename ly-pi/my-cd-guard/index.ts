import { realpathSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { stripRedundantCd } from "./detector";

export default function myCdGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const result = stripRedundantCd(event.input.command, ctx.cwd, realpathSync);
    if (!result) return undefined;
    event.input.command = result.command;
    if (ctx.hasUI) {
      ctx.ui.notify(
        `已自动剥掉冗余 cd 前缀：${result.stripped.trim()}`,
        "info",
      );
    }
    return undefined;
  });
}
