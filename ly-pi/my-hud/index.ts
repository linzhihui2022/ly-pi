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
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { join } from "node:path";
import { Bar } from "./bar";
import { loadHudConfig } from "./config";
import { setModelShortNames } from "./format";
import { icon } from "./icons";
import { checkMemoryPressure } from "./memory";
import { buildMemoryWarningLines } from "./memory-widget";
import { getPullRequestForCurrentBranch, openUrl } from "./pr";
import { setHiddenFields } from "./render";
import { getLastUserMessage } from "./session";
import { pickRandomMessage } from "./working";

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions", "ly-pi");

// Color git --short status prefix (XY) as a single unit.
// Keep plain spaces outside theme.fg() — TUI strips trailing spaces in styled text.
function colorLine(theme: Theme, line: string): string {
  const rawStatus = line.slice(0, 2);
  const rest = line.slice(2);
  const color = statusColor(rawStatus);
  const ch = rawStatus.trim() || rawStatus;
  const lead = rawStatus[0] === " " ? " " : "";
  const trail = rawStatus[1] === " " ? " " : "";
  const prefix = lead + (color ? theme.fg(color, ch) : ch) + trail;
  return prefix + theme.fg("dim", rest);
}

function statusColor(status: string): string | undefined {
  const ch = status.replace(/[ .]/g, "")[0];
  if (!ch) return undefined;
  const map: Record<string, string> = {
    A: "success",
    M: "warning",
    D: "error",
    R: "info",
    U: "error",
    "?": "dim",
    "!": "dim",
  };
  return map[ch];
}

export { Bar } from "./bar";
export {
  contextColored,
  formatCacheRate,
  formatTokens,
  shortModelName,
} from "./format";
// Re-export pure helpers for consumers / tests
export { icon } from "./icons";
export { checkMemoryPressure } from "./memory";
export { buildMemoryWarningLines } from "./memory-widget";
export { buildStatusLine, formatGitStatus } from "./render";
export {
  aggregateJudgeCost,
  aggregateSessionUsage,
  extractEntryUsage,
  getLastUserMessage,
} from "./session";
export type { StatusLineData, TokenUsage } from "./types";
export { pickRandomMessage, WORKING_MESSAGES } from "./working";

const MEMORY_WIDGET_KEY = "my-hud-memory-warning";
const GST_LINE_LIMIT = 10;

// ── Extension ──

export default function myHud(pi: ExtensionAPI): void {
  let currentTui: { requestRender(): void } | null = null;
  let bar: Bar | undefined;

  const hudConfig = loadHudConfig(EXT_DIR);
  setModelShortNames(hudConfig.modelShortNames);
  setHiddenFields(hudConfig.hiddenFields);

  // Refresh both footer and widget on lifecycle events
  function requestRender(): void {
    if (currentTui) currentTui.requestRender();
    bar?.requestRender();
  }

  function updateMemoryWarning(ctx: ExtensionContext): void {
    const memoryStatus = checkMemoryPressure();
    const theme = ctx.ui.getTheme("catppuccin-mocha");
    const lines = theme ? buildMemoryWarningLines(theme, memoryStatus) : null;

    if (lines) {
      ctx.ui.setWidget(
        MEMORY_WIDGET_KEY,
        (_tui, _theme) => ({
          render: (_width: number) => lines,
          invalidate: () => {},
        }),
        { placement: "aboveEditor" },
      );
    } else {
      ctx.ui.setWidget(MEMORY_WIDGET_KEY, undefined);
    }
  }

  pi.on("turn_start", () => {
    bar?.invalidateGitStatus();
    bar?.invalidatePullRequest();
    requestRender();
  });

  pi.on("model_select", requestRender);
  pi.on("thinking_level_select", requestRender);
  pi.on("turn_end", () => {
    bar?.invalidateGitStatus();
    bar?.invalidatePullRequest();
    requestRender();
  });

  pi.on("tool_call", () => {
    // Refresh judge stats after my-permission records a decision.
    bar?.requestRender();
  });

  // Listen for log toggle events from my-log extension.
  pi.events?.on?.("ly-log:toggle", (data: unknown) => {
    const event = data as { enabled: boolean };
    bar?.setLogEnabled(event.enabled);
    requestRender();
  });

  pi.on("agent_start", (_event, ctx) => {
    updateMemoryWarning(ctx);
    // Pick the working message once per agent run: pi fires turn_start on
    // every tool-call iteration, so picking there would reshuffle mid-turn.
    const theme = ctx.ui.getTheme("catppuccin-mocha");
    const message =
      theme?.fg("accent", pickRandomMessage()) ?? pickRandomMessage();
    ctx.ui.setWorkingMessage(message);
  });
  // ── /open-pr command ──
  pi.registerCommand("open-pr", {
    description: "Open the current branch's GitHub Pull Request in browser",
    handler: async (_args, ctx) => {
      const pr = await getPullRequestForCurrentBranch(
        ctx.cwd,
        process.env.GITHUB_TOKEN,
      );
      if (!pr) {
        ctx.ui.notify("当前分支没有关联的 PR", "info");
        return;
      }

      try {
        await openUrl(pr.url);
      } catch {
        ctx.ui.notify(pr.url, "info");
      }
    },
  });

  // ── /gst command ──
  pi.registerCommand("gst", {
    description: "Show git status (--short)",
    handler: async (_args, ctx) => {
      const result = await pi.exec("git", ["status", "--short"], {
        cwd: ctx.cwd,
        timeout: 3000,
      });
      const output = result.stdout.trim();
      if (!output) {
        ctx.ui.notify("working tree clean", "info");
        return;
      }
      const theme = ctx.ui.theme;
      const allLines = output.split("\n");
      const truncated = allLines.length > GST_LINE_LIMIT
        ? allLines.slice(0, GST_LINE_LIMIT)
        : allLines;
      const colored = truncated
        .map((line) => colorLine(theme, line))
        .join("\n");
      const suffix = allLines.length > GST_LINE_LIMIT
        ? `\n...and ${allLines.length - GST_LINE_LIMIT} more`
        : "";
      ctx.ui.notify(" " + colored + suffix, "info");
    },
  });

  // ── /mem command ──
  pi.registerCommand("mem", {
    description: "Show current system memory usage",
    handler: async (_args, ctx) => {
      const { percent, ok } = checkMemoryPressure();
      ctx.ui.notify(`内存使用: ${percent}%`, ok ? "info" : "warning");
    },
  });

  // ── Install HUD on session start ──
  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    if (!ctx.hasUI) {
      return;
    }
    bar ??= new Bar();
    bar.setUICtx(ctx.ui);
    bar.setContext(ctx);
    bar.update();

    ctx.ui.setFooter((tui, theme, footerData) => {
      currentTui = tui;
      bar?.setBranch(footerData.getGitBranch() ?? null);

      const unsubBranch = footerData.onBranchChange(() => {
        bar?.setBranch(footerData.getGitBranch() ?? null);
        bar?.invalidateGitStatus();
        bar?.invalidatePullRequest();
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
              const firstLine = message.split("\n")[0];
              return [
                truncateToWidth(
                  theme.fg("dim", `${icon("terminal")}${firstLine}`),
                  width,
                ),
              ];
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
