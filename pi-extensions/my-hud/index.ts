/**
 * my-hud — always-on dual-line HUD statusline for pi agent.
 *
 * Replaces pi's built-in footer with a custom dual-line Component
 * showing project, model, git branch, context%, token/cost, cwd,
 * and provider count. Installed automatically on session_start.
 *
 * Modeled after:
 *   - examples/extensions/custom-footer.ts (setFooter pattern)
 *   - dist/modes/interactive/components/footer.js (token aggregation, color thresholds)
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";

// ── Token formatting (mirrors footer.js:23-28) ──

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ── Context% color (mirrors footer.js:112-119) ──

type ThemeFg = (color: "error" | "warning" | "success" | "dim", text: string) => string;

export function contextColored(theme: { fg: ThemeFg }, pct: number | null): string {
  if (pct === null) return theme.fg("dim", "--");
  const display = `${Math.round(pct)}%`;
  if (pct > 90) return theme.fg("error", display);
  if (pct > 70) return theme.fg("warning", display);
  return theme.fg("dim", display);
}

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
          // ── Token aggregation (full session: getEntries) ──
          let totalInput = 0;
          let totalOutput = 0;
          let totalCacheRead = 0;
          let totalCacheWrite = 0;
          let totalCost = 0;

          for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              const m = entry.message as AssistantMessage;
              totalInput += m.usage.input;
              totalOutput += m.usage.output;
              totalCacheRead += m.usage.cacheRead;
              totalCacheWrite += m.usage.cacheWrite;
              totalCost += m.usage.cost.total;
            }
          }

          // ── Context usage ──
          const cu = ctx.getContextUsage();
          const ctxPct = cu?.percent ?? null;
          const ctxColored = contextColored(theme, ctxPct);

          // ── Model ──
          const modelName = ctx.model?.id ?? "no-model";

          // ── Git branch ──
          const branch = footerData.getGitBranch();
          const branchStr = branch ? ` (${branch})` : "";

          // ── Project name ──
          const project = basename(ctx.cwd);

          // ── Line 1: project · model · (branch) · ctx% · ↑↓$ ──
          const costStr = `$${totalCost.toFixed(3)}`;
          const line1Parts = [
            theme.fg("dim", project),
            theme.fg("dim", modelName + branchStr),
            ctxColored,
            theme.fg("dim", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)} ${costStr}`),
          ];
          const line1 = truncateToWidth(line1Parts.join(" · "), width);

          // ── Line 2: cwd · N providers ──
          const providerCount = footerData.getAvailableProviderCount();
          const provStr = `${providerCount} provider${providerCount !== 1 ? "s" : ""}`;
          const line2 = truncateToWidth(
            theme.fg("dim", `${ctx.cwd} · ${provStr}`),
            width,
          );

          return [line1, line2];
        },
      };
    });
  });
}
