import { createServer, type Server } from "node:http";
import type { PreviewServer } from "./types";

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
        reject(new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`));
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

export async function createPreviewServer(
  htmlContent: string,
  options: { host: string; urlHost: string },
): Promise<PreviewServer> {
  await stopPreviewServer();

  const startPort = 49152 + Math.floor(Math.random() * 16383);
  const port = await findAvailablePort(startPort, options.host);
  const url = `http://${options.urlHost}:${port}`;

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlContent);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve) => server.listen(port, options.host, resolve));

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


