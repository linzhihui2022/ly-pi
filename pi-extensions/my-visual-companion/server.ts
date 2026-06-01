import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { ServerAPI, ClickEvent } from "./types";

// ── Pure functions (exported for testing) ──

/** Parse events file into structured ClickEvent array. */
export function readEventsFile(stateDir: string): ClickEvent[] {
  const eventsFile = join(stateDir, "events");
  if (!existsSync(eventsFile)) return [];
  const raw = readFileSync(eventsFile, "utf-8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as ClickEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is ClickEvent => e !== null);
}

// ── Server state ──

interface ServerState {
  process: ChildProcess;
  port: number;
  url: string;
  screenDir: string;
  stateDir: string;
  sessionDir: string;
}

let state: ServerState | null = null;

// ── Server lifecycle ──

const SCRIPTS_DIR =
  process.env.VISUAL_COMPANION_SCRIPTS ||
  join(process.env.HOME ?? "/tmp", ".pi/agent/skills/my-superpowers/brainstorming/scripts");

function getRandomPort(): number {
  return 49152 + Math.floor(Math.random() * 16383);
}

function ensureSessionDir(scriptsDir: string): string {
  const sessionId = `${process.pid}-${Date.now()}`;
  const sessionDir = join(scriptsDir, "..", ".sessions", sessionId);
  mkdirSync(join(sessionDir, "content"), { recursive: true });
  mkdirSync(join(sessionDir, "state"), { recursive: true });
  return sessionDir;
}

/**
 * Start the visual companion server by spawning server.cjs.
 * Resolves with server info once the startup JSON is received.
 */
function startServer(scriptsDir: string): Promise<ServerState> {
  return new Promise((resolve, reject) => {
    const port = getRandomPort();
    const sessionDir = ensureSessionDir(scriptsDir);
    const serverScript = join(scriptsDir, "server.cjs");

    if (!existsSync(serverScript)) {
      reject(new Error(`server.cjs not found at ${serverScript}`));
      return;
    }

    const child = spawn("node", [serverScript], {
      cwd: scriptsDir,
      env: {
        ...process.env,
        BRAINSTORM_PORT: String(port),
        BRAINSTORM_HOST: "127.0.0.1",
        BRAINSTORM_DIR: sessionDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Server startup timed out after 10s"));
    }, 10000);

    let stderr = "";

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === "server-started") {
            clearTimeout(timeout);
            const s: ServerState = {
              process: child,
              port: msg.port,
              url: msg.url,
              screenDir: msg.screen_dir,
              stateDir: msg.state_dir,
              sessionDir,
            };
            state = s;
            resolve(s);
            return;
          }
        } catch {
          // Not JSON, skip
        }
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && state === null) {
        reject(new Error(`Server exited with code ${code}: ${stderr}`));
      }
      state = null;
    });
  });
}

async function ensureRunning(scriptsDir: string): Promise<ServerState> {
  // Check if process is still alive
  if (state && state.process.exitCode === null && state.process.kill(0)) {
    // Verify server-info file still exists (server may have timed out)
    const infoFile = join(state.stateDir, "server-info");
    if (existsSync(infoFile)) {
      return state;
    }
    // Server stopped, clean up
    state.process.kill();
    state = null;
  }

  return startServer(scriptsDir);
}

// ── ServerAPI implementation ──

export function createServer(scriptsDir: string): ServerAPI {
  return {
    async show(html: string, filename: string) {
      const s = await ensureRunning(scriptsDir);
      const filePath = join(s.screenDir, filename);
      writeFileSync(filePath, html);
      return { url: s.url };
    },

    getEvents(): ClickEvent[] {
      if (!state || state.process.exitCode !== null) return [];
      return readEventsFile(state.stateDir);
    },

    async stop() {
      if (!state) return;
      const p = state.process;
      state = null;

      p.kill("SIGTERM");

      // Wait up to 2s for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (p.exitCode === null) p.kill("SIGKILL");
          resolve();
        }, 2000);
        p.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },

    isRunning(): boolean {
      if (!state) return false;
      try {
        return state.process.exitCode === null && state.process.kill(0);
      } catch {
        return false;
      }
    },
  };
}
