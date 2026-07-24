import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";

export function recordJudgeStats(
  ctx: ExtensionContext,
  allowed: boolean,
): void {
  ctx.sessionManager.appendEntry(JUDGE_STATS_CUSTOM_TYPE, {
    decision: allowed ? "allowed" : "denied",
  });
}
