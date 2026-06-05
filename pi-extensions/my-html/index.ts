import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import open from "open";
import { ensurePreviewServer, stopPreviewServer, PREVIEW_DIR } from "./server";
import { renderMarkdownToHtml, buildHtmlDocument, extractAssistantText } from "./render";

interface AssistantContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

function findLatestAssistantMessage(
  entries: SessionEntry[],
): { text: string; thinking: string; entryId: string } | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") {
      continue;
    }

    const content = entry.message.content as AssistantContentBlock[];
    const text = extractAssistantText(content, "text");
    const thinking = extractAssistantText(content, "thinking");

    if (text || thinking) {
      return { text, thinking, entryId: entry.id };
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
        mkdirSync(PREVIEW_DIR, { recursive: true });

        const sessionId = ctx.sessionManager.getSessionId();
        const fileName = `${sessionId}${message.entryId}.html`;
        const filePath = join(PREVIEW_DIR, fileName);
        writeFileSync(filePath, html, "utf-8");

        const server = await ensurePreviewServer({
          host: "127.0.0.1",
          urlHost: "localhost",
          port: 3456,
        });

        const fileUrl = `${server.url}/${fileName}`;
        open(fileUrl).catch(() => {
          // Browser open failures are non-fatal
        });
        ctx.ui.notify(`Preview: ${fileUrl}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to start preview server: ${(err as Error).message}`,
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
