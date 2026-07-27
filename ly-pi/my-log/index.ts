/**
 * my-log — developer logging extension for pi agent.
 *
 * Provides:
 * - /ly-log [on|off] command to toggle logging
 * - /ly-log (no args) to view logs in browser
 * - createDevLogger(source) for other modules to create loggers
 * - pi.events "ly-log:toggle" for HUD integration
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { createLogger, type Logger } from "../src/shared/logger";
import { renderLogPage, type LogEntryWithTimestamp } from "../src/shared/log-page";
import {
  servePreviewFile,
  stopPreviewServer,
} from "../src/shared/preview";

const LOG_CUSTOM_TYPE = "ly-log";
const LOG_CONFIG_CUSTOM_TYPE = "ly-log-config";

/** Module-level state shared with other modules via createDevLogger. */
let _pi: ExtensionAPI | null = null;
let _enabled = false;

/**
 * Create a logger for an extension module.
 * Writes are dropped when logging is disabled.
 */
export function createDevLogger(source: string): Logger {
  return createLogger(source, (entry) => {
    if (_enabled && _pi) {
      _pi.appendEntry(LOG_CUSTOM_TYPE, entry);
    }
  });
}

function restoreEnabled(ctx: ExtensionCommandContext): void {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === "custom" &&
      entry.customType === LOG_CONFIG_CUSTOM_TYPE
    ) {
      _enabled =
        (entry.data as { enabled?: boolean } | undefined)?.enabled === true;
      return;
    }
  }
  _enabled = false;
}

function collectLogEntries(
  ctx: ExtensionCommandContext,
): LogEntryWithTimestamp[] {
  const entries = ctx.sessionManager.getEntries();
  const result: LogEntryWithTimestamp[] = [];
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === LOG_CUSTOM_TYPE) {
      const data = entry.data as Record<string, unknown> | undefined;
      if (
        data &&
        typeof data.level === "string" &&
        typeof data.source === "string" &&
        typeof data.msg === "string"
      ) {
        result.push({
          level: data.level as LogEntryWithTimestamp["level"],
          source: data.source,
          msg: data.msg,
          data: data.data,
          timestamp: entry.timestamp,
        });
      }
    }
  }
  return result;
}

export default function myLog(pi: ExtensionAPI): void {
  _pi = pi;

  pi.on("session_start", (_event, ctx) => {
    restoreEnabled(ctx);
    pi.events.emit("ly-log:toggle", { enabled: _enabled });
  });

  pi.registerCommand("ly-log", {
    description: "管理开发日志 /ly-log [on|off]",
    handler: async (args, ctx) => {
      const sub = args?.trim();

      if (sub === "on") {
        _enabled = true;
        pi.appendEntry(LOG_CONFIG_CUSTOM_TYPE, { enabled: true });
        pi.events.emit("ly-log:toggle", { enabled: true });
        ctx.ui.notify("日志已开启", "info");
        return;
      }

      if (sub === "off") {
        _enabled = false;
        pi.appendEntry(LOG_CONFIG_CUSTOM_TYPE, { enabled: false });
        pi.events.emit("ly-log:toggle", { enabled: false });
        ctx.ui.notify("日志已关闭", "info");
        return;
      }

      // No args: show log page
      const logs = collectLogEntries(ctx);
      if (logs.length === 0) {
        ctx.ui.notify("当前会话暂无日志记录。使用 /ly-log on 开启。", "info");
        return;
      }

      try {
        const sessionId = ctx.sessionManager.getSessionId();
        const fileUrl = await servePreviewFile(
          sessionId,
          "ly-log.html",
          renderLogPage(logs),
        );
        ctx.ui.notify(`Preview: ${fileUrl}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to start preview server: ${(err as Error).message}`,
          "error",
        );
      }
    },
  });

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });
}
