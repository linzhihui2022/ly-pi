/**
 * my-hud — always-on HUD for pi agent.
 *
 * - aboveEditor widget: project, model, git branch, context%, tokens, cost
 * - footer: last user message
 *
 * Modeled after:
 *   - examples/extensions/custom-footer.ts (setFooter pattern)
 *   - dist/modes/interactive/components/footer.js (token aggregation, color thresholds)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { getLastUserMessage } from "./session";
import { Bar } from "./bar";
import { icon } from "./icons";

// Re-export pure helpers for consumers / tests
export { icon } from "./icons";
export { formatTokens, contextColored, shortModelName } from "./format";
export { aggregateSessionUsage, getLastUserMessage } from "./session";
export { buildStatusLine } from "./render";
export { Bar } from "./bar";
export type { TokenUsage, StatusLineData } from "./types";

// ── Extension ──

export default function myHud(pi: ExtensionAPI): void {
  let currentTui: { requestRender(): void } | null = null;
  let bar: Bar | undefined;

  // Refresh both footer and widget on lifecycle events
  function requestRender(): void {
    if (currentTui) currentTui.requestRender();
    bar?.requestRender();
  }

  pi.on("turn_end", requestRender);
  pi.on("model_select", requestRender);

  // ── Install HUD on session start ──
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (ctx.hasUI) {
      bar ??= new Bar();
      bar.setUICtx(ctx.ui);
      bar.setContext(ctx);
      bar.update();
    }

    ctx.ui.setFooter((tui, theme, footerData) => {
      currentTui = tui;
      bar?.setBranch(footerData.getGitBranch() ?? null);

      const unsubBranch = footerData.onBranchChange(() => {
        bar?.setBranch(footerData.getGitBranch() ?? null);
        tui.requestRender();
      });

      return {
        dispose() {
          unsubBranch();
          currentTui = null;
          bar?.dispose();
        },

        invalidate() {},

        render(width: number): string[] {
          try {
            const entries = ctx.sessionManager.getEntries();
            const message = getLastUserMessage(entries);
            if (message) {
              return [truncateToWidth(theme.fg("dim", `${icon("terminal")}${message}`), width)];
            }
            return [];
          } catch (err) {
            return [`[my-hud error] ${String(err)}`];
          }
        },
      };
    });
  });
}
