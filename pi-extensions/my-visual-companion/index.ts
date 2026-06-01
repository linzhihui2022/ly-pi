import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createServer, readEventsFile } from "./server";
import type { VisualAction, VisualResult, ServerAPI } from "./types";

// ── Scripts directory ──

const DEFAULT_SCRIPTS_DIR = (() => {
  const home = process.env.HOME ?? "/tmp";
  return `${home}/.pi/agent/skills/my-superpowers/brainstorming/scripts`;
})();

// ── Pure handler (exported for testing) ──

export async function handleVisualAction(
  action: VisualAction,
  server: ServerAPI,
): Promise<VisualResult> {
  switch (action.action) {
    case "show": {
      const { url } = await server.show(action.html, action.filename);
      return { success: true, message: `Open ${url} in your browser`, url };
    }
    case "events": {
      const events = server.getEvents();
      return {
        success: true,
        message: events.length > 0 ? `${events.length} browser event(s)` : "No browser events yet",
        events,
      };
    }
    case "stop": {
      await server.stop();
      return { success: true, message: "Visual companion server stopped" };
    }
    default:
      return { success: false, message: `Unknown action: ${(action as VisualAction).action}` };
  }
}

// ── Extension entry ──

export default function myVisualCompanion(pi: ExtensionAPI): void {
  let server: ServerAPI | null = null;

  function getServer(): ServerAPI {
    if (!server) {
      server = createServer(DEFAULT_SCRIPTS_DIR);
    }
    return server;
  }

  pi.registerTool({
    name: "brainstorm_visual",
    description:
      "Browser-based visual companion for brainstorming. Use 'show' to push HTML mockups/diagrams to a browser, 'events' to read user click events, 'stop' to shut down the server.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["show", "events", "stop"],
          description: "show: push HTML to browser. events: read click events. stop: kill server.",
        },
        html: {
          type: "string",
          description: "HTML content to display (required for 'show'). Write just the content fragment — the server wraps it in a full page template.",
        },
        filename: {
          type: "string",
          description: "File name for this screen, e.g. 'layout.html' (required for 'show'). Use semantic names. Never reuse filenames.",
        },
      },
      required: ["action"],
    },
    handler: async (input: Record<string, unknown>, _ctx: ExtensionContext) => {
      const action = input as unknown as VisualAction;
      const result = await handleVisualAction(action, getServer());
      return JSON.stringify(result);
    },
  });

  // Clean up on shutdown
  pi.on("session_shutdown", async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });
}
