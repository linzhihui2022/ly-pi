import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "./session";

describe("SessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("creates a session with unique id and stores it", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;

    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    expect(session.id).toBeTruthy();
    expect(session.port).toBe(8080);
    expect(manager.get(session.id)).toBe(session);
  });

  it("destroy removes session and clears timer", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;
    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    const id = session.id;
    manager.destroy(id);

    expect(manager.get(id)).toBeUndefined();
    expect(session.idleTimer).toBeNull();
    expect(mockServer.close).toHaveBeenCalled();
    expect(mockWss.close).toHaveBeenCalled();
  });

  it("updateScreen sets active screen and clears events", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;
    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    session.events.push({ type: "click", text: "old", timestamp: Date.now() });
    manager.updateScreen(session.id, "layout", "<h1>Hello</h1>");

    expect(session.activeScreen).toBe("layout");
    expect(session.screens.get("layout")?.html).toBe("<h1>Hello</h1>");
    expect(session.events).toEqual([]);
  });

  it("appendEvent adds to events array", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;
    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    manager.appendEvent(session.id, { type: "click", text: "hi", timestamp: 1 });

    expect(session.events).toHaveLength(1);
    expect(session.events[0].text).toBe("hi");
  });

  it("auto-destroys session after idle timeout", () => {
    const manager = new SessionManager({ idleTimeoutMs: 5000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;
    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    vi.advanceTimersByTime(6000);

    expect(manager.get(session.id)).toBeUndefined();
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("resetIdleTimer postpones auto-destruction", () => {
    const manager = new SessionManager({ idleTimeoutMs: 5000 });
    const mockServer = { close: vi.fn((cb) => cb?.()) } as any;
    const mockWss = { close: vi.fn(), clients: new Set() } as any;
    const session = manager.create(8080, "http://localhost:8080", mockServer, mockWss);

    vi.advanceTimersByTime(3000);
    manager.resetIdleTimer(session.id);
    vi.advanceTimersByTime(3000);

    expect(manager.get(session.id)).toBeDefined();

    vi.advanceTimersByTime(3000);
    expect(manager.get(session.id)).toBeUndefined();
  });

  it("destroyAll cleans up every session", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    const sessions = [] as any[];
    for (let i = 0; i < 3; i++) {
      const s = { close: vi.fn((cb) => cb?.()) } as any;
      const w = { close: vi.fn(), clients: new Set() } as any;
      sessions.push(manager.create(8080 + i, `http://localhost:${8080 + i}`, s, w));
    }

    manager.destroyAll();

    for (const s of sessions) {
      expect(manager.get(s.id)).toBeUndefined();
    }
  });

  it("resetIdleTimer silently ignores unknown session", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    // Should not throw
    manager.resetIdleTimer("nonexistent");
  });

  it("appendEvent silently ignores unknown session", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    // Should not throw
    manager.appendEvent("nonexistent", { type: "click", text: "hi", timestamp: 1 });
  });

  it("updateScreen silently ignores unknown session", () => {
    const manager = new SessionManager({ idleTimeoutMs: 30_000 });
    // Should not throw
    manager.updateScreen("nonexistent", "layout", "<h1>Hi</h1>");
  });
});
