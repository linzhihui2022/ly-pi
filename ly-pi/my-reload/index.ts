import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MARKER_TYPE = "reload_marker";
const CONTINUE_MESSAGE = "继续之前的工作";

interface ReloadMarker {
  reason: string;
  pending: boolean;
}

interface SessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
  message?: { role: string };
}

export default function myReload(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "request_reload",
    label: "Request Reload",
    description:
      "Mark that the current session needs an extension reload before continuing. " +
      "Call this after deploying extension changes, then tell the user to run /reload. " +
      "After reload, the agent will automatically continue working.",
    parameters: Type.Object({
      reason: Type.String({
        description:
          "Why a reload is needed (e.g. 'modified my-hud render logic')",
      }),
    }),
    async execute(_toolCallId, params) {
      pi.appendEntry(MARKER_TYPE, {
        reason: params.reason,
        pending: true,
      });
      return {
        content: [
          {
            type: "text",
            text:
              `已标记需要 reload。原因：${params.reason}\n\n` +
              `请执行 \`/reload\` 以重新加载扩展，之后 agent 将自动继续。`,
          },
        ],
        details: {},
      };
    },
  });

  pi.on("session_start", (event, ctx: ExtensionContext) => {
    if (event.reason !== "reload") return;

    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    if (entries.length === 0) return;

    // Find the most recent pending reload_marker by scanning backwards.
    // Stop if we encounter a user message first (stale guard).
    let markerIndex = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "message" && entry.message?.role === "user") {
        // User interacted since the marker was set — don't auto-continue.
        return;
      }
      if (entry.type === "custom" && entry.customType === MARKER_TYPE) {
        const data = entry.data as ReloadMarker | undefined;
        if (data?.pending) {
          markerIndex = i;
          break;
        }
      }
    }
    if (markerIndex === -1) return;

    pi.sendUserMessage(CONTINUE_MESSAGE);
  });
}
