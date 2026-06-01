/**
 * my-hud — always-on single-line HUD statusline for pi agent.
 *
 * Replaces pi's built-in footer with a custom Component showing project,
 * model, git branch, context%, token/cost breakdown, and provider count.
 * Installed automatically on session_start.
 *
 * Modeled after:
 *   - examples/extensions/custom-footer.ts (setFooter pattern)
 *   - dist/modes/interactive/components/footer.js (token aggregation, color thresholds)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import { icon } from "./icons";
import { formatTokens, contextColored } from "./format";
import { aggregateSessionUsage } from "./session";
import { buildStatusLine } from "./render";
import type { SessionEntry } from "./types";

// Re-export pure helpers for consumers / tests
export { icon } from "./icons";
export { formatTokens, contextColored } from "./format";
export { aggregateSessionUsage } from "./session";
export { buildStatusLine } from "./render";
export type { TokenUsage, SessionEntry, StatusLineData } from "./types";

// ── Extension ──

export default function myHud(pi: ExtensionAPI): void {
  let currentTui: { requestRender(): void } | null = null;

  // Auto-refresh on turn end and model switch
  pi.on("turn_end", () => {
    if (currentTui) currentTui.requestRender();
  });

  pi.on("model_select", () => {
    if (currentTui) currentTui.requestRender();
  });

  // ── Install HUD on session start ──

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      currentTui = tui;
      const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsubBranch();
          currentTui = null;
        },

        invalidate() {},

        render(width: number): string[] {
          try {
            // ── Aggregated usage ──
            const entries = ctx.sessionManager.getEntries() as SessionEntry[];
            const usage = aggregateSessionUsage(entries);

            // ── Context usage ──
            const cu = ctx.getContextUsage();
            const ctxColored = contextColored(
              theme,
              cu?.percent ?? null,
              cu?.contextWindow ?? null,
            );

            // ── Other metadata ──
            const modelName = ctx.model?.id ?? "no-model";
            const branch = footerData.getGitBranch();
            const project = basename(ctx.cwd);

            // ── Build status line ──
            const line = buildStatusLine(theme, width, {
              project,
              modelName,
              branch,
              ctxColored,
              usage,
            });

            return [line];
          } catch (err) {
            return [`[my-hud error] ${String(err)}`];
          }
        },
      };
    });
  });
}
