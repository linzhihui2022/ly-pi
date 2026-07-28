import { realpathSync } from "node:fs";
import type { GuardConfig } from "../shared/guard-harness";
import { stripRedundantCd, type CdStripResult } from "./detector";

export const cdGuard: GuardConfig<CdStripResult> = {
  name: "cd-guard",
  detect: (command, cwd) => stripRedundantCd(command, cwd, realpathSync),
  react: (detection, event, ctx) => {
    event.input.command = detection.command;
    if (ctx.hasUI) {
      ctx.ui.notify(
        `已自动剥掉冗余 cd 前缀：${detection.stripped.trim()}`,
        "info",
      );
    }
  },
  onBeforeAgentStart: (systemPrompt, cwd) =>
    systemPrompt +
    `\n\nCRITICAL: All bash commands execute in ${cwd}. NEVER prefix commands with \`cd ${cwd} &&\` — it is redundant and will be automatically stripped. Run the command directly instead.`,
};
