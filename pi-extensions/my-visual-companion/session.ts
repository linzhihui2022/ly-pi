import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  truncateSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { WebSocketServer } from "ws";
import type { Session, CompanionEvent } from "./types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateKey(): string {
  return randomBytes(32).toString("base64url");
}

export function resolveWorkspaceDir(sessionId: string): string {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
    }).trim();
    return join(root, ".lychee", "visual-companion", sessionId);
  } catch {
    return join(tmpdir(), ".lychee", "visual-companion", sessionId);
  }
}

function ensureWorkspace(dir: string): void {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitignore"), "*\n");
}

export interface SessionManagerOptions {
  idleTimeoutMs: number;
  focusApp?: string;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private idleTimeoutMs: number;
  private focusApp?: string;
  private waitResolvers = new Map<
    string,
    { resolve: (event: CompanionEvent) => void; reject: (err: Error) => void }
  >();

  constructor(options: SessionManagerOptions) {
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.focusApp = options.focusApp;
  }

  create(
    port: number,
    url: string,
    server: Server,
    wss: WebSocketServer,
  ): Session {
    const id = generateId();
    const key = generateKey();
    const workspaceDir = resolveWorkspaceDir(id);
    ensureWorkspace(workspaceDir);

    const session: Session = {
      id,
      key,
      port,
      url,
      server,
      wss,
      screens: new Map<
        string,
        typeof session.screens extends Map<string, infer T> ? T : never
      >(),
      events: [],
      activeScreen: null,
      lastActivity: Date.now(),
      idleTimer: null,
      workspaceDir,
    };
    this.sessions.set(session.id, session);
    this.resetIdleTimer(session.id);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  updateScreen(id: string, name: string, html: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.screens.set(name, { name, html, createdAt: Date.now() });
    session.activeScreen = name;
    session.events = [];
    session.lastActivity = Date.now();
    this.resetIdleTimer(id);

    const eventsFile = join(session.workspaceDir, "events.jsonl");
    if (existsSync(eventsFile)) {
      truncateSync(eventsFile, 0);
    }
  }

  appendEvent(id: string, event: CompanionEvent): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.events.push(event);
    session.lastActivity = Date.now();
    this.resetIdleTimer(id);

    const eventsFile = join(session.workspaceDir, "events.jsonl");
    appendFileSync(eventsFile, JSON.stringify(event) + "\n");

    if (event.type === "confirm") {
      const resolver = this.waitResolvers.get(id);
      if (resolver) {
        resolver.resolve(event);
        this.waitResolvers.delete(id);
      }
      this.focusApplication();
    }
  }

  resetIdleTimer(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }
    session.idleTimer = setTimeout(() => {
      this.destroy(id);
    }, this.idleTimeoutMs);
  }

  destroy(id: string): void {
    const resolver = this.waitResolvers.get(id);
    if (resolver) {
      resolver.reject(new Error("Session destroyed"));
      this.waitResolvers.delete(id);
    }

    const session = this.sessions.get(id);
    if (!session) return;
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    session.wss.clients.forEach((ws: any) => ws.terminate());
    session.wss.close();
    session.server.close();
    session.events = [];
    session.screens.clear();
    this.sessions.delete(id);
  }

  waitForConfirm(id: string, timeoutMs: number): Promise<CompanionEvent> {
    return new Promise((resolve, reject) => {
      const session = this.sessions.get(id);
      if (!session) {
        reject(new Error("Session not found"));
        return;
      }

      if (this.waitResolvers.has(id)) {
        reject(new Error("Already waiting for confirm"));
        return;
      }

      const existing = session.events.find((e) => e.type === "confirm");
      if (existing) {
        resolve(existing);
        return;
      }

      const timeoutId = setTimeout(() => {
        this.waitResolvers.delete(id);
        reject(new Error("Timeout waiting for confirm"));
      }, timeoutMs);

      this.waitResolvers.set(id, {
        resolve: (event) => {
          clearTimeout(timeoutId);
          resolve(event);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });
    });
  }

  private focusApplication(): void {
    if (!this.focusApp) return;
    try {
      execSync(
        `osascript -e 'tell application "${this.focusApp}" to activate'`,
        { timeout: 5000 },
      );
    } catch {
      // Silently ignore focus errors
    }
  }

  destroyAll(): void {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      this.destroy(id);
    }
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }
}
