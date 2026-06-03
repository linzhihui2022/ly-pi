import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVisualCompanionAPI } from "./api";
import { SessionManager } from "./session";

describe("createVisualCompanionAPI", () => {
  let manager: SessionManager;
  let api: ReturnType<typeof createVisualCompanionAPI>;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
    api = createVisualCompanionAPI(manager, { host: "127.0.0.1", urlHost: "localhost" });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("start creates a new session", async () => {
    const info = await api.start();
    expect(info.sessionId).toBeTruthy();
    expect(info.port).toBeGreaterThan(0);
    expect(info.url).toContain("http://");
  });

  it("show updates screen in session", async () => {
    const { sessionId } = await api.start();
    await api.show(sessionId, "layout", "<h1>Test</h1>");

    const session = manager.get(sessionId);
    expect(session?.activeScreen).toBe("layout");
    expect(session?.screens.get("layout")?.html).toBe("<h1>Test</h1>");
  });

  it("show throws for unknown session", async () => {
    await expect(api.show("bad-id", "layout", "<h1>Test</h1>")).rejects.toThrow("Session not found");
  });

  it("events returns event list", async () => {
    const { sessionId } = await api.start();
    manager.appendEvent(sessionId, { type: "click", text: "hi", timestamp: 1 });

    const events = await api.events(sessionId);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("hi");
  });

  it("events throws for unknown session", async () => {
    await expect(api.events("bad-id")).rejects.toThrow("Session not found");
  });

  it("stop destroys session", async () => {
    const { sessionId } = await api.start();
    await api.stop(sessionId);
    expect(manager.get(sessionId)).toBeUndefined();
  });

  it("stopAll destroys all sessions", async () => {
    const s1 = await api.start();
    const s2 = await api.start();
    await api.stopAll();
    expect(manager.get(s1.sessionId)).toBeUndefined();
    expect(manager.get(s2.sessionId)).toBeUndefined();
  });
});
