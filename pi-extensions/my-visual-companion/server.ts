import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { SessionManager } from "./session";
import type { Session, CompanionEvent } from "./types";

const EXT_DIR = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { /* not ESM */ }
  return process.cwd();
})();

const FRAME_TEMPLATE = readFileSync(join(EXT_DIR, "frame.html"), "utf-8");
const HELPER_SCRIPT = readFileSync(join(EXT_DIR, "helper.js"), "utf-8");
const HELPER_INJECTION = `<script src="/helper.js"></script>`;

const WAITING_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Brainstorm Companion</title>
<style>body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { color: #333; } p { color: #666; }</style>
</head>
<body><h1>Brainstorm Companion</h1>
<p>Waiting for the agent to push a screen...</p></body></html>`;

export function isFullDocument(html: string): boolean {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function wrapInFrame(content: string): string {
  return FRAME_TEMPLATE.replace("<!-- CONTENT -->", content);
}

export async function findAvailablePort(startPort: number, host: string, maxAttempts = 100): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;

    function tryPort() {
      if (currentPort >= startPort + maxAttempts) {
        reject(new Error(`No available port found in range ${startPort}-${startPort + maxAttempts}`));
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

export interface ServerOptions {
  host: string;
  urlHost: string;
}

export async function createCompanionServer(
  manager: SessionManager,
  options: ServerOptions
): Promise<{ session: Session }> {
  const startPort = 49152 + Math.floor(Math.random() * 16383);
  const port = await findAvailablePort(startPort, options.host);
  const url = `http://${options.urlHost}:${port}`;

  let sessionId: string | null = null;

  const wss = new WebSocketServer({ noServer: true });
  const httpServer = createServer((req, res) => {
    if (!sessionId) {
      res.writeHead(503);
      res.end("Server not ready");
      return;
    }
    handleRequest(req, res, manager, sessionId);
  });

  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      if (!sessionId) return;
      try {
        const event = JSON.parse(data.toString()) as CompanionEvent;
        event.timestamp = event.timestamp || Date.now();
        manager.appendEvent(sessionId, event);
        if (event.type === "confirm") {
          manager.resetIdleTimer(sessionId);
        }
      } catch {
        // ignore malformed messages
      }
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, options.host, resolve));

  const session = manager.create(port, url, httpServer, wss);
  sessionId = session.id;

  // Hook updateScreen to broadcast reload
  const originalUpdateScreen = manager.updateScreen.bind(manager);
  manager.updateScreen = (id: string, name: string, html: string) => {
    originalUpdateScreen(id, name, html);
    if (id === sessionId) {
      const message = JSON.stringify({ type: "reload" });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  };

  return { session };
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  sessionId: string
): void {
  const session = manager.get(sessionId);
  if (!session) {
    res.writeHead(503);
    res.end("Session not found");
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    let html: string;
    if (session.activeScreen && session.screens.has(session.activeScreen)) {
      const screen = session.screens.get(session.activeScreen)!;
      html = isFullDocument(screen.html) ? screen.html : wrapInFrame(screen.html);
    } else {
      html = WAITING_PAGE;
    }

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${HELPER_INJECTION}\n</body>`);
    } else {
      html += HELPER_INJECTION;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } else if (req.method === "GET" && req.url === "/helper.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(HELPER_SCRIPT);
  } else if (req.method === "GET" && req.url?.startsWith("/files/")) {
    const fileName = req.url.slice(7);
    if (session.screens.has(fileName)) {
      const screen = session.screens.get(fileName)!;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(screen.html);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
}
