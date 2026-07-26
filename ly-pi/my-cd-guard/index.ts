import { realpathSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { stripRedundantCd } from "./detector";

export default function myCdGuard(pi: ExtensionAPI): void {
  let projectRoot = "";

  pi.on("session_start", (_event, ctx) => {
    projectRoot = ctx.cwd;
  });

  pi.on("before_agent_start", async (event) => {
    if (!projectRoot) return;
    return {
      systemPrompt:
        event.systemPrompt +
        `\n\nThe shell starts in ${projectRoot}. Do not prepend \`cd ${projectRoot} &&\` before commands — it is redundant.`,
    };
  });

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
