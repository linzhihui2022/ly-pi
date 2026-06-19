import type { SessionManager } from "./session";
import type { SessionInfo, CompanionEvent } from "./types";
import { createCompanionServer } from "./server";

export interface APIOptions {
  host: string;
  urlHost: string;
}

export function createVisualCompanionAPI(manager: SessionManager, options: APIOptions) {
  return {
    async start(): Promise<SessionInfo> {
      const { session } = await createCompanionServer(manager, options);
      return {
        sessionId: session.id,
        key: session.key,
        port: session.port,
        url: session.url,
      };
    },

    async show(sessionId: string, name: string, html: string): Promise<{ url: string }> {
      const session = manager.get(sessionId);
      if (!session) throw new Error("Session not found");
      manager.updateScreen(sessionId, name, html);
      return { url: session.url };
    },

    async wait(sessionId: string, timeoutMs: number): Promise<CompanionEvent> {
      return manager.waitForConfirm(sessionId, timeoutMs);
    },

    async events(sessionId: string): Promise<CompanionEvent[]> {
      const session = manager.get(sessionId);
      if (!session) throw new Error("Session not found");
      return [...session.events];
    },

    async stop(sessionId: string): Promise<void> {
      manager.destroy(sessionId);
    },

    async stopAll(): Promise<void> {
      manager.destroyAll();
    },
  };
}
