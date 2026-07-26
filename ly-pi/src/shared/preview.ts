import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import open from "open";
import {
  ensurePreviewServer,
  PREVIEW_DIR,
  stopPreviewServer,
} from "../../web-preview/index";

export interface ServePreviewOptions {
  host?: string;
  urlHost?: string;
  port?: number;
}

/**
 * Write a file into the preview directory, start the preview server, and open
 * the browser. Returns the file URL.
 *
 * Shared by `/html` (my-html) and judge-log (my-permission).
 */
export async function servePreviewFile(
  sessionId: string,
  fileName: string,
  content: string,
  options: ServePreviewOptions = {},
): Promise<string> {
  const sessionDir = join(PREVIEW_DIR, sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const filePath = join(sessionDir, fileName);
  writeFileSync(filePath, content, "utf-8");

  const server = await ensurePreviewServer({
    host: options.host ?? "127.0.0.1",
    urlHost: options.urlHost ?? "localhost",
    port: options.port ?? 3456,
  });

  const fileUrl = `${server.url}/${sessionId}/${fileName}`;
  open(fileUrl).catch(() => {
    // Browser open failures are non-fatal
  });
  return fileUrl;
}

export { PREVIEW_DIR, stopPreviewServer };
