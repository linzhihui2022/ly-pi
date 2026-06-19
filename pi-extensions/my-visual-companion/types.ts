// pi-extensions/my-visual-companion/types.ts
import type { Server } from "node:http";
import type { WebSocketServer } from "ws";

export interface Screen {
  name: string;
  html: string;
  createdAt: number;
}

export interface CompanionEvent {
  type: "click" | "confirm" | "choice";
  choice?: string | string[];
  text?: string;
  id?: string | null;
  count?: number;
  timestamp: number;
  value?: unknown;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  key: string;
  port: number;
  url: string;
  server: Server;
  wss: WebSocketServer;
  screens: Map<string, Screen>;
  events: CompanionEvent[];
  activeScreen: string | null;
  lastActivity: number;
  idleTimer: NodeJS.Timeout | null;
  workspaceDir: string;
}

export interface SessionInfo {
  sessionId: string;
  key: string;
  port: number;
  url: string;
}

export interface VisualCompanionConfig {
  focusApp?: string;
  defaultHost: string;
  defaultUrlHost: string;
  idleTimeoutMinutes: number;
}
