import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { createCompanionServer, findAvailablePort, isFullDocument, handleRequest, createHttpHandler, createWsMessageHandler, createUpdateScreenHook } from "./server";
import { SessionManager } from "./session";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

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

  it("rejects when range is exhausted", async () => {
    // Occupy the only port in range
    const occupier = createServer();
    await new Promise<void>((resolve) => occupier.listen(55200, "127.0.0.1", resolve));

    await expect(findAvailablePort(55200, "127.0.0.1", 1)).rejects.toThrow("No available port");

    occupier.close();
    await new Promise<void>((resolve) => occupier.on("close", resolve));
  });

  it("rejects for non-EADDRINUSE errors", async () => {
    // Port < 1024 requires root on most systems, triggers EACCES
    await expect(findAvailablePort(1, "127.0.0.1", 1)).rejects.toThrow();
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

  it("serves helper.js route", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const res = await fetch(`${session.url}/helper.js`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain("WS_URL");

    await manager.destroy(session.id);
  });

  it("returns 404 for unknown methods", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const res = await fetch(session.url, { method: "POST" });
    expect(res.status).toBe(404);

    await manager.destroy(session.id);
  });

  it("injects helper script even without </body>", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    manager.updateScreen(session.id, "nobody", "<h1>No Body</h1>");

    const res = await fetch(session.url);
    const text = await res.text();

    expect(text).toContain("No Body");
    expect(text).toContain("helper.js");

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

  it("ignores malformed WebSocket messages", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const ws = new WebSocket(`ws://localhost:${session.port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    ws.send("not valid json");

    await new Promise((r) => setTimeout(r, 300));

    expect(session.events).toHaveLength(0);

    ws.close();
    await manager.destroy(session.id);
  });

  it("rejects findAvailablePort for invalid host", async () => {
    await expect(findAvailablePort(55000, "invalid.host.name.that.does.not.exist")).rejects.toThrow();
  });

  it("confirm WebSocket events reset idle timer", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const ws = new WebSocket(`ws://localhost:${session.port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    // Spy on resetIdleTimer
    const spy = vi.spyOn(manager, "resetIdleTimer");

    ws.send(JSON.stringify({ type: "confirm", text: "Selected", timestamp: Date.now() }));

    await new Promise((r) => setTimeout(r, 300));

    // Should be called once by appendEvent (which calls resetIdleTimer for confirm)
    // and again by the WS handler itself
    expect(spy).toHaveBeenCalled();
    
    ws.close();
    await manager.destroy(session.id);
  });

  it("does not broadcast reload for different session id", async () => {
    const { session: serverSession } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });
    // Create another session manually (not via companion server, so no WS broadcast hook for it)
    const otherSession = manager.create(9999, "http://localhost:9999", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);

    const ws = new WebSocket(`ws://localhost:${serverSession.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    const messages: any[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));

    // Update the OTHER session — the hook should check id !== sessionId and skip broadcast
    manager.updateScreen(otherSession.id, "test", "<h1>Other session</h1>");

    await new Promise((r) => setTimeout(r, 300));

    // No broadcast to this server's WS
    expect(messages).toHaveLength(0);

    ws.close();
    await manager.destroy(serverSession.id);
    await manager.destroy(otherSession.id);
  });

  it("does not broadcast reload to non-open clients", async () => {
    const { session } = await createCompanionServer(manager, { host: "127.0.0.1", urlHost: "localhost" });

    const ws = new WebSocket(`ws://localhost:${session.port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS timeout")), 2000);
    });

    const messages: any[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));

    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Now update screen — client is closed, should not send to it
    manager.updateScreen(session.id, "layout", "<h1>After close</h1>");
    await new Promise((r) => setTimeout(r, 300));

    expect(messages).toHaveLength(0);

    await manager.destroy(session.id);
  });
});

describe("handleRequest", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  function mockRes() {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    return res;
  }

  function mockReq(method = "GET", url = "/"): IncomingMessage {
    return { method, url } as unknown as IncomingMessage;
  }

  it("returns 503 when session not found", () => {
    const req = mockReq();
    const res = mockRes();

    handleRequest(req, res, manager, "nonexistent");

    expect(res.writeHead).toHaveBeenCalledWith(503);
    expect(res.end).toHaveBeenCalledWith("Session not found");
  });

  it("returns 404 on non-matching paths", () => {
    const { session } = (() => {
      // Create a session inside manager
      const s = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
      return { session: s };
    })();

    const req = mockReq("POST", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("Not found");
  });

  it("serves waiting page when no active screen", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);

    const req = mockReq("GET", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("Waiting for the agent");
  });

  it("serves active screen wrapped in frame", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    manager.updateScreen(session.id, "main", "<h1>Hello</h1>");

    const req = mockReq("GET", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("Hello");
    expect(endArg).toContain("helper.js");
  });

  it("serves full documents without wrapping", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    manager.updateScreen(session.id, "full", "<!DOCTYPE html><html><body><h1>Full</h1></body></html>");

    const req = mockReq("GET", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("Full");
    expect(endArg).toContain("helper.js");
  });

  it("injects helper script without </body> tag", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    manager.updateScreen(session.id, "nobody", "<h1>No body</h1>");

    const req = mockReq("GET", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("No body");
    expect(endArg).toContain("helper.js");
  });

  it("injects helper script for full doc without </body>", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    manager.updateScreen(session.id, "nobodyclose", "<!DOCTYPE html><html><body><h1>No close");

    const req = mockReq("GET", "/");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("No close");
    expect(endArg).toContain("helper.js");
  });

  it("serves helper.js", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);

    const req = mockReq("GET", "/helper.js");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/javascript; charset=utf-8" });
    const endArg = (res.end as any).mock.calls[0][0] as string;
    expect(endArg).toContain("WS_URL");
  });

  it("serves screen files via /files/ route", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    manager.updateScreen(session.id, "popup", "<div>Popup content</div>");

    const req = mockReq("GET", "/files/popup");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
    expect(res.end).toHaveBeenCalledWith("<div>Popup content</div>");
  });

  it("returns 404 for unknown /files/ path", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);

    const req = mockReq("GET", "/files/unknown");
    const res = mockRes();

    handleRequest(req, res, manager, session.id);

    expect(res.writeHead).toHaveBeenCalledWith(404);
  });
});

describe("createHttpHandler", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("returns 503 when sessionId is null", () => {
    const handler = createHttpHandler(manager, () => null);
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as import("node:http").ServerResponse;

    handler(
      { method: "GET", url: "/" } as unknown as import("node:http").IncomingMessage,
      res,
    );

    expect(res.writeHead).toHaveBeenCalledWith(503);
    expect(res.end).toHaveBeenCalledWith("Server not ready");
  });

  it("delegates to handleRequest when sessionId is set", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    const handler = createHttpHandler(manager, () => session.id);
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as import("node:http").ServerResponse;

    handler(
      { method: "GET", url: "/" } as unknown as import("node:http").IncomingMessage,
      res,
    );

    // Should serve the waiting page
    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html; charset=utf-8" });
    expect((res.end as any).mock.calls[0][0]).toContain("Waiting for the agent");
  });
});

describe("createUpdateScreenHook", () => {
  it("calls original updateScreen", () => {
    const original = vi.fn();
    const hook = createUpdateScreenHook(
      {} as any,
      original,
      "session-1",
      { clients: new Set() } as any,
    );

    hook("session-1", "test", "<h1>Hi</h1>");

    expect(original).toHaveBeenCalledWith("session-1", "test", "<h1>Hi</h1>");
  });

  it("broadcasts to WebSocket clients when id matches sessionId", () => {
    const mockSend = vi.fn();
    const mockClient = { readyState: WebSocket.OPEN, send: mockSend };
    const hook = createUpdateScreenHook(
      {} as any,
      vi.fn(),
      "session-1",
      { clients: new Set([mockClient]) } as any,
    );

    hook("session-1", "test", "<h1>Hi</h1>");

    expect(mockSend).toHaveBeenCalledWith(JSON.stringify({ type: "reload" }));
  });

  it("skips broadcast when id does not match sessionId", () => {
    const mockSend = vi.fn();
    const mockClient = { readyState: WebSocket.OPEN, send: mockSend };
    const hook = createUpdateScreenHook(
      {} as any,
      vi.fn(),
      "session-1",
      { clients: new Set([mockClient]) } as any,
    );

    hook("session-2", "test", "<h1>Hi</h1>");

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips non-open clients when broadcasting", () => {
    const mockSend = vi.fn();
    const mockClosedClient = { readyState: WebSocket.CLOSED, send: mockSend };
    const hook = createUpdateScreenHook(
      {} as any,
      vi.fn(),
      "session-1",
      { clients: new Set([mockClosedClient]) } as any,
    );

    hook("session-1", "test", "<h1>Hi</h1>");

    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("createWsMessageHandler", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("ignores messages when sessionId is null", () => {
    const spy = vi.spyOn(manager, "appendEvent");
    const handler = createWsMessageHandler(manager, () => null);

    handler(JSON.stringify({ type: "click", text: "hi" }));

    expect(spy).not.toHaveBeenCalled();
  });

  it("appends event to session", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    const spy = vi.spyOn(manager, "appendEvent");
    const handler = createWsMessageHandler(manager, () => session.id);

    handler(JSON.stringify({ type: "click", text: "hello", timestamp: 123 }));

    expect(spy).toHaveBeenCalledWith(session.id, expect.objectContaining({ type: "click", text: "hello" }));
  });

  it("defaults timestamp to Date.now() when missing", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    const spy = vi.spyOn(manager, "appendEvent");
    const handler = createWsMessageHandler(manager, () => session.id);

    handler(JSON.stringify({ type: "click", text: "hello" }));

    expect(spy).toHaveBeenCalled();
    const appendedEvent = spy.mock.calls[0][1];
    expect(typeof appendedEvent.timestamp).toBe("number");
    expect(appendedEvent.timestamp).toBeGreaterThan(0);
  });

  it("calls resetIdleTimer on confirm events", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    const spy = vi.spyOn(manager, "resetIdleTimer");
    const handler = createWsMessageHandler(manager, () => session.id);

    handler(JSON.stringify({ type: "confirm", text: "yes", timestamp: 123 }));

    expect(spy).toHaveBeenCalledWith(session.id);
  });

  it("ignores malformed JSON", () => {
    const session = manager.create(8080, "http://localhost:8080", { close: vi.fn((cb: any) => cb?.()) } as any, { close: vi.fn(), clients: new Set() } as any);
    const spy = vi.spyOn(manager, "appendEvent");
    const handler = createWsMessageHandler(manager, () => session.id);

    handler("not valid json");

    expect(spy).not.toHaveBeenCalled();
  });
});
