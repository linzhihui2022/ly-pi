import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { SessionManager } from "./session";
import { createVisualCompanionAPI } from "./api";

export function createTools(manager: SessionManager, options: { host: string; urlHost: string }) {
  const api = createVisualCompanionAPI(manager, options);

  return [
    defineTool({
      name: "visual_companion_start",
      label: "Start Visual Companion",
      description: "Start a Visual Companion browser session. Returns session_id, port, and URL.",
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
        const info = await api.start();
        return {
          content: [{ type: "text" as const, text: `Visual Companion started at ${info.url} (session: ${info.sessionId})` }],
          details: info,
        };
      },
    }),

    defineTool({
      name: "visual_companion_show",
      label: "Show Screen",
      description: "Push an HTML screen to the Visual Companion browser. Provide session_id, a semantic name, and the HTML fragment or full document.",
      parameters: Type.Object({
        session_id: Type.String({ description: "Session ID from visual_companion_start" }),
        name: Type.String({ description: "Semantic screen name (e.g., layout-options)" }),
        html: Type.String({ description: "HTML content to display" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        try {
          const { url } = await api.show(params.session_id, params.name, params.html);
          return {
            content: [{ type: "text" as const, text: `Screen "${params.name}" shown. Open or refresh: ${url}` }],
            details: { success: true, url },
          };
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err.message}` }],
            details: { error: err.message },
          };
        }
      },
    }),

    defineTool({
      name: "visual_companion_wait",
      label: "Wait for Confirm",
      description: "Wait for user to confirm a selection in the Visual Companion browser. Blocks until confirmed or timeout. Only returns on confirm events (click alone does not resolve).",
      parameters: Type.Object({
        session_id: Type.String({ description: "Session ID from visual_companion_start" }),
        timeout_ms: Type.Number({ default: 300000, description: "Timeout in milliseconds" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        try {
          const event = await api.wait(params.session_id, params.timeout_ms);
          return {
            content: [{ type: "text" as const, text: `Confirmed: ${event.text || event.choice || ""}` }],
            details: { confirmed: true, event },
          };
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err.message}` }],
            details: { error: err.message },
          };
        }
      },
    }),

    defineTool({
      name: "visual_companion_read_events",
      label: "Read Events",
      description: "Read user interaction events (clicks, confirms) from the Visual Companion session.",
      parameters: Type.Object({
        session_id: Type.String({ description: "Session ID from visual_companion_start" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        try {
          const events = await api.events(params.session_id);
          const text = events.length === 0
            ? "No events yet."
            : `Events:\n${events.map((e) => `- ${e.type}: ${e.text || e.choice || ""}`).join("\n")}`;
          return {
            content: [{ type: "text" as const, text }],
            details: { events },
          };
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err.message}` }],
            details: { error: err.message },
          };
        }
      },
    }),

    defineTool({
      name: "visual_companion_stop",
      label: "Stop Visual Companion",
      description: "Stop a Visual Companion session and free resources.",
      parameters: Type.Object({
        session_id: Type.String({ description: "Session ID from visual_companion_start" }),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        await api.stop(params.session_id);
        return {
          content: [{ type: "text" as const, text: "Visual Companion session stopped." }],
          details: { stopped: true },
        };
      },
    }),
  ];
}
