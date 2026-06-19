import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { SessionManager } from "./session";
import type { Session, CompanionEvent } from "./types";

export function resolveExtDir(): string {
  return __dirname;
}

const EXT_DIR = resolveExtDir();

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

export function parseUrl(url: string): {
  pathname: string;
  searchParams: URLSearchParams;
} {
  // node:http req.url only has path + query, so prepend a dummy origin.
  const parsed = new URL(url, "http://localhost");
  return { pathname: parsed.pathname, searchParams: parsed.searchParams };
}

function validateKey(req: IncomingMessage, session: Session): boolean {
  const { searchParams } = parseUrl(req.url || "/");
  const cookieHeader = req.headers?.cookie || "";
  const cookieKey = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("vc_key="));
  const cookieValue = cookieKey
    ? decodeURIComponent(cookieKey.split("=")[1])
    : undefined;
  const key = searchParams.get("key") || cookieValue;
  return key === session.key;
}

function setKeyCookie(res: ServerResponse, key: string): void {
  res.setHeader(
    "Set-Cookie",
    `vc_key=${encodeURIComponent(key)}; Path=/; SameSite=Strict`,
  );
}

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
            `No available port found in range ${startPort}-${startPort + maxAttempts}`,
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

export interface ServerOptions {
  host: string;
  urlHost: string;
}

export function createHttpHandler(
  manager: SessionManager,
  getSessionId: () => string | null,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      res.writeHead(503);
      res.end("Server not ready");
      return;
    }
    handleRequest(req, res, manager, sessionId);
  };
}

export function createWsMessageHandler(
  manager: SessionManager,
  getSessionId: () => string | null,
) {
  return (data: Buffer | string) => {
    const sessionId = getSessionId();
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
  };
}

export function createUpdateScreenHook(
  manager: SessionManager,
  originalUpdateScreen: (id: string, name: string, html: string) => void,
  sessionId: string | null,
  wss: WebSocketServer,
) {
  return (id: string, name: string, html: string) => {
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
}

export async function createCompanionServer(
  manager: SessionManager,
  options: ServerOptions,
): Promise<{ session: Session }> {
  const startPort = 49152 + Math.floor(Math.random() * 16383);
  const port = await findAvailablePort(startPort, options.host);

  let sessionId: string | null = null;

  const wss = new WebSocketServer({ noServer: true });
  const httpServer = createServer(createHttpHandler(manager, () => sessionId));

  httpServer.on("upgrade", (request, socket, head) => {
    if (!sessionId) {
      socket.destroy();
      return;
    }
    const session = manager.get(sessionId);
    if (!session) {
      socket.destroy();
      return;
    }
    const { searchParams } = parseUrl(request.url || "/");
    const cookieHeader = request.headers.cookie || "";
    const cookieKey = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("vc_key="));
    const cookieValue = cookieKey
      ? decodeURIComponent(cookieKey.split("=")[1])
      : undefined;
    const key = searchParams.get("key") || cookieValue;
    if (key !== session.key) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    ws.on(
      "message",
      createWsMessageHandler(manager, () => sessionId),
    );
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(port, options.host, resolve),
  );

  const session = manager.create(port, "", httpServer, wss);
  sessionId = session.id;
  session.url = `http://${options.urlHost}:${port}/?key=${encodeURIComponent(session.key)}`;

  // Hook updateScreen to broadcast reload
  manager.updateScreen = createUpdateScreenHook(
    manager,
    manager.updateScreen.bind(manager),
    sessionId,
    wss,
  );

  return { session };
}

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  sessionId: string,
): void {
  const session = manager.get(sessionId);
  if (!session) {
    res.writeHead(503);
    res.end("Session not found");
    return;
  }

  const { pathname, searchParams } = parseUrl(req.url || "/");

  // Allow helper.js and the current screen asset through when the key is
  // supplied via cookie (the browser loads these without query params after
  // the first validated page load). Other paths still require key validation.
  const keyRequired =
    pathname !== "/helper.js" && !pathname.startsWith("/files/");
  if (keyRequired && !validateKey(req, session)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // For /helper.js and /files/*, still enforce the key if no cookie was set.
  if (!keyRequired) {
    const cookieHeader = req.headers?.cookie || "";
    const cookieKey = cookieHeader
      .split(";")
      .find((c) => c.trim().startsWith("vc_key="));
    const cookieValue = cookieKey
      ? decodeURIComponent(cookieKey.split("=")[1])
      : undefined;
    const key = searchParams.get("key") || cookieValue;
    if (key !== session.key) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
  }

  if (req.method === "GET" && pathname === "/") {
    let html: string;
    if (session.activeScreen && session.screens.has(session.activeScreen)) {
      const screen = session.screens.get(session.activeScreen)!;
      html = isFullDocument(screen.html)
        ? screen.html
        : wrapInFrame(screen.html);
    } else {
      html = WAITING_PAGE;
    }

    if (html.includes("</body>")) {
      html = html.replace("</body>", `${HELPER_INJECTION}\n</body>`);
    } else {
      html += HELPER_INJECTION;
    }

    setKeyCookie(res, session.key);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } else if (req.method === "GET" && pathname === "/helper.js") {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
    res.end(HELPER_SCRIPT);
  } else if (req.method === "GET" && pathname?.startsWith("/files/")) {
    const fileName = pathname.slice(7);
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
