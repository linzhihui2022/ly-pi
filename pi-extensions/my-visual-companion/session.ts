import type { Server } from "node:http";
import type { WebSocketServer } from "ws";
import type { Session, Screen, CompanionEvent } from "./types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface SessionManagerOptions {
  idleTimeoutMs: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private idleTimeoutMs: number;

  constructor(options: SessionManagerOptions) {
    this.idleTimeoutMs = options.idleTimeoutMs;
  }

  create(port: number, url: string, server: Server, wss: WebSocketServer): Session {
    const session: Session = {
      id: generateId(),
      port,
      url,
      server,
      wss,
      screens: new Map<string, Screen>(),
      events: [],
      activeScreen: null,
      lastActivity: Date.now(),
      idleTimer: null,
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
  }

  appendEvent(id: string, event: CompanionEvent): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.events.push(event);
    session.lastActivity = Date.now();
    this.resetIdleTimer(id);
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
