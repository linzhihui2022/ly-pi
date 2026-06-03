import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "./session";
import { createTools } from "./tools";
import type { VisualCompanionConfig } from "./types";

const EXT_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { /* not ESM */ }
  return process.cwd();
})();

function loadConfig(): VisualCompanionConfig {
  const raw = readFileSync(join(EXT_DIR, "my-visual-companion.json"), "utf-8");
  return JSON.parse(raw) as VisualCompanionConfig;
}

export default function myVisualCompanion(pi: ExtensionAPI): void {
  const config = loadConfig();
  const idleTimeoutMs = (config.idleTimeoutMinutes || 30) * 60 * 1000;
  const manager = new SessionManager({ idleTimeoutMs });
  const tools = createTools(manager, {
    host: config.defaultHost || "127.0.0.1",
    urlHost: config.defaultUrlHost || "localhost",
  });

  // Register LLM tools
  for (const tool of tools) {
    pi.registerTool(tool);
  }

  // Register slash commands
  pi.registerCommand("vc-start", {
    description: "Start a Visual Companion browser session",
    handler: async (_args, ctx: ExtensionContext) => {
      const tool = tools.find((t) => t.name === "visual_companion_start")!;
      const result = await tool.execute("cmd-start", {}, undefined, undefined, ctx);
      ctx.ui.notify(result.content.map((c) => c.text).join("\n"), "info");
    },
  });

  pi.registerCommand("vc-show", {
    description: "Show an HTML screen in Visual Companion (args: session_id name html)",
    handler: async (args, ctx: ExtensionContext) => {
      if (!args) {
        ctx.ui.notify("Usage: /vc-show <session_id> <name> <html>", "warning");
        return;
      }
      const parts = args.split(" ");
      const sessionId = parts[0];
      const name = parts[1] || "screen";
      const html = parts.slice(2).join(" ");
      const tool = tools.find((t) => t.name === "visual_companion_show")!;
      const result = await tool.execute("cmd-show", { session_id: sessionId, name, html }, undefined, undefined, ctx);
      ctx.ui.notify(result.content.map((c) => c.text).join("\n"), result.details?.error ? "error" : "info");
    },
  });

  pi.registerCommand("vc-events", {
    description: "Read events from a Visual Companion session",
    handler: async (args, ctx: ExtensionContext) => {
      const sessionId = args?.trim() || "";
      if (!sessionId) {
        ctx.ui.notify("Usage: /vc-events <session_id>", "warning");
        return;
      }
      const tool = tools.find((t) => t.name === "visual_companion_read_events")!;
      const result = await tool.execute("cmd-events", { session_id: sessionId }, undefined, undefined, ctx);
      ctx.ui.notify(result.content.map((c) => c.text).join("\n"), "info");
    },
  });

  pi.registerCommand("vc-stop", {
    description: "Stop a Visual Companion session",
    handler: async (args, ctx: ExtensionContext) => {
      const sessionId = args?.trim() || "";
      if (!sessionId) {
        ctx.ui.notify("Usage: /vc-stop <session_id>", "warning");
        return;
      }
      const tool = tools.find((t) => t.name === "visual_companion_stop")!;
      await tool.execute("cmd-stop", { session_id: sessionId }, undefined, undefined, ctx);
      ctx.ui.notify("Visual Companion session stopped.", "info");
    },
  });

  // Lifecycle events
  pi.on("session_start", () => {
    // Session start — nothing special needed, tools are already registered
  });

  pi.on("session_shutdown", async () => {
    await manager.destroyAll();
  });
}
