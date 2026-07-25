import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import {
  detectFileWriteBypass,
  detectInlineScript,
  type GuardDetection,
} from "./detector";

const ESCALATION_THRESHOLD = 3;
const PREVIEW_LIMIT = 500;

export function buildReason(detection: GuardDetection): string {
  if (detection.kind === "file-write") {
    return (
      `Blocked file write via bash (${detection.tool} → ${detection.target}). ` +
      "Use the write/edit tools to create or modify files instead of heredocs or output redirects. " +
      "Short one-liners (80 chars or less, single line) are fine."
    );
  }
  return (
    `Blocked inline ${detection.interpreter} script (${detection.kind}). ` +
    "Do not run long inline scripts via bash. " +
    "Prefer dedicated tools (read/write/edit/grep) for file and text operations. " +
    `If a script is genuinely required, write it to a file with the write tool, then run \`${detection.interpreter} <file>\`.`
  );
}

function buildConfirmMessage(
  detection: GuardDetection,
  blockedCount: number,
): { title: string; body: string } {
  const preview =
    detection.code.length > PREVIEW_LIMIT
      ? `${detection.code.slice(0, PREVIEW_LIMIT)}…`
      : detection.code;
  if (detection.kind === "file-write") {
    return {
      title: `文件写入旁路已被拦截 ${blockedCount} 次，是否放行？`,
      body: [`方式：${detection.tool} → ${detection.target}`, "", preview].join(
        "\n",
      ),
    };
  }
  return {
    title: `内联脚本已被拦截 ${blockedCount} 次，是否放行？`,
    body: [
      `解释器：${detection.interpreter}`,
      `形式：${detection.kind}`,
      "",
      preview,
    ].join("\n"),
  };
}

export default function myScriptGuard(pi: ExtensionAPI): void {
  let blockedCount = 0;

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    // Inline Script first: an interpreter heredoc body may itself contain
    // echo/cat lines that would otherwise be flagged as file writes.
    const detection =
      detectInlineScript(event.input.command) ??
      detectFileWriteBypass(event.input.command);
    if (!detection) return undefined;

    blockedCount += 1;

    if (blockedCount > ESCALATION_THRESHOLD && ctx.hasUI) {
      const { title, body } = buildConfirmMessage(detection, blockedCount);
      const allowed = await ctx.ui.confirm(title, body);
      if (allowed) return undefined;
    }

    return { block: true, reason: buildReason(detection) };
  });
}
