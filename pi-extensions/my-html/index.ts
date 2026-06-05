import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import open from "open";
import { createPreviewServer, stopPreviewServer } from "./server";
import { renderMarkdownToHtml, buildHtmlDocument, stripMarkdown, extractAssistantText } from "./render";
import { copyToClipboard } from "./clipboard";

interface AssistantContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

function findLatestAssistantMessage(
  entries: SessionEntry[],
): { text: string; thinking: string } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") {
      continue;
    }

    const content = entry.message.content as AssistantContentBlock[];
    const text = extractAssistantText(content, "text");
    const thinking = extractAssistantText(content, "thinking");

    if (text || thinking) {
      return { text, thinking };
    }
  }
  return null;
}

export default function myHtml(pi: ExtensionAPI): void {
  // ── /html command ──
  pi.registerCommand("html", {
    description: "Render latest agent reply as HTML and open in browser",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const entries = ctx.sessionManager.getEntries();
      const message = findLatestAssistantMessage(entries);

      if (!message || (!message.text && !message.thinking)) {
        ctx.ui.notify("No agent reply to preview.", "warn");
        return;
      }

      const bodyHtml = renderMarkdownToHtml(message.text || "");
      const html = buildHtmlDocument(
        bodyHtml,
        message.thinking || undefined,
      );

      try {
        const server = await createPreviewServer(html, {
          host: "127.0.0.1",
          urlHost: "localhost",
        });
        open(server.url).catch(() => {
          // Browser open failures are non-fatal
        });
        ctx.ui.notify(`Preview: ${server.url}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to start preview server: ${(err as Error).message}`,
          "error",
        );
      }
    },
  });

  // ── /copy command ──
  pi.registerCommand("copy", {
    description: "Copy latest agent reply to clipboard (md / --thinking flags)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const entries = ctx.sessionManager.getEntries();
      const message = findLatestAssistantMessage(entries);

      if (!message || (!message.text && !message.thinking)) {
        ctx.ui.notify("No agent reply to copy.", "warn");
        return;
      }

      const includeMd = args?.includes("md") ?? false;
      const includeThinking = args?.includes("--thinking") ?? false;

      let output = "";

      if (includeThinking && message.thinking) {
        output += `[Thinking]:\n${message.thinking}\n\n`;
      }

      if (includeMd) {
        output += message.text || "";
      } else {
        output += stripMarkdown(message.text || "");
      }

      if (!output.trim()) {
        ctx.ui.notify("Nothing to copy.", "warn");
        return;
      }

      try {
        copyToClipboard(output.trim());
        ctx.ui.notify("Copied to clipboard.", "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to copy: ${(err as Error).message}`,
          "error",
        );
      }
    },
  });

  // ── Lifecycle ──
  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });
}
