import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { createCompanionServer, findAvailablePort, isFullDocument } from "./server";
import { SessionManager } from "./session";

describe("isFullDocument", () => {
  it("returns true for full HTML documents", () => {
    expect(isFullDocument("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isFullDocument("<html></html>")).toBe(true);
  });

  it("returns false for fragments", () => {
    expect(isFullDocument("<h1>Hello</h1>")).toBe(false);
  });
});

describe("findAvailablePort", () => {
  it("finds an available port", async () => {
    const port = await findAvailablePort(55000, "127.0.0.1");
    expect(port).toBeGreaterThanOrEqual(55000);
  });
});

describe("createCompanionServer", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("starts HTTP server on available port and serves waiting page", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const res = await fetch(session.url);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain("Waiting for the agent to push a screen");

    await manager.destroy(session.id);
  });

  it("serves active screen wrapped in frame", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    manager.updateScreen(session.id, "layout", "<h1>Test Screen</h1>");

    const res = await fetch(session.url);
    const text = await res.text();

    expect(text).toContain("Test Screen");
    expect(text).toContain("Brainstorm Companion");
    expect(text).toContain("helper.js");

    await manager.destroy(session.id);
  });

  it("serves full documents without wrapping", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    manager.updateScreen(session.id, "full", "<!DOCTYPE html><html><body><h1>Full</h1></body></html>");

    const res = await fetch(session.url);
    const text = await res.text();

    expect(text).toContain("Full");
    expect(text).not.toContain("<!-- CONTENT -->");

    await manager.destroy(session.id);
  });

  it("returns 404 for unknown files", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const res = await fetch(`${session.url}/files/nonexistent.png`);
    expect(res.status).toBe(404);

    await manager.destroy(session.id);
  });

  it("broadcasts reload via WebSocket when screen updates", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const ws = new WebSocket(`ws://localhost:${session.port}`);
    const messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));

    manager.updateScreen(session.id, "layout", "<h1>New</h1>");

    await new Promise((r) => setTimeout(r, 300));

    expect(messages.some((m) => m.type === "reload")).toBe(true);

    ws.close();
    await manager.destroy(session.id);
  });

  it("receives click events and appends to session", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const ws = new WebSocket(`ws://localhost:${session.port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    ws.send(JSON.stringify({ type: "click", text: "Option A", choice: "a", timestamp: Date.now() }));

    await new Promise((r) => setTimeout(r, 300));

    expect(session.events).toHaveLength(1);
    expect(session.events[0].type).toBe("click");
    expect(session.events[0].choice).toBe("a");

    ws.close();
    await manager.destroy(session.id);
  });
});
