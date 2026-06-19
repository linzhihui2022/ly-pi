import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreviewServer } from "./types";

export const PREVIEW_DIR = join(tmpdir(), "pi-html-preview");
const DEFAULT_PORT = 3456;

let activeServer: PreviewServer | null = null;

export async function findAvailablePort(
  startPort: number,
  host: string,
  maxAttempts = 100,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;

    function tryPort() {
      if (currentPort >= startPort + maxAttempts) {
        reject(
          new Error(
            `No available port found in range ${startPort}-${startPort + maxAttempts - 1}`,
          ),
        );
        return;
      }

      const testServer = createServer();
      testServer.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          currentPort++;
          tryPort();
        } else {
          reject(err);
        }
      });
      testServer.once("listening", () => {
        testServer.close(() => resolve(currentPort));
      });
      testServer.listen(currentPort, host);
    }

    tryPort();
  });
}

export async function ensurePreviewServer(options: {
  host: string;
  urlHost: string;
  port?: number;
}): Promise<PreviewServer> {
  if (activeServer) {
    return activeServer;
  }

  const port = await findAvailablePort(
    options.port ?? DEFAULT_PORT,
    options.host,
  );
  const url = `http://${options.urlHost}:${port}`;

  const server = createServer((req, res) => {
    const urlPath = req.url!;

    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    if (urlPath === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Pi HTML Preview</h1><p>Use /html to generate previews.</p>");
      return;
    }

    if (urlPath.endsWith(".html")) {
      const fileName = urlPath.slice(1);
      const filePath = join(PREVIEW_DIR, fileName);

      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) =>
    server.listen(port, options.host, resolve),
  );

  activeServer = { port, url, server };
  return activeServer;
}

export async function stopPreviewServer(): Promise<void> {
  if (!activeServer) return;

  const { server } = activeServer;
  activeServer = null;

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
