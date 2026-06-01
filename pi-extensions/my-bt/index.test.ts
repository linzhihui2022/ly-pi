import { describe, it, expect, vi, beforeEach } from "vitest";

// Track registered handlers
const registeredEvents = new Map<string, (...args: any[]) => any>();
const registeredCommands = new Map<string, any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerCommand: vi.fn((name: string, opts: any) => {
    registeredCommands.set(name, opts);
  }),
};

async function loadModule() {
  return await import("./index");
}

describe("my-bt extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    registeredCommands.clear();
    mockPi.on.mockClear();
    mockPi.registerCommand.mockClear();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers /bt command", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredCommands.has("bt")).toBe(true);
  });

  it("registers session_start handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("session_start")).toBe(true);
  });

  it("registers agent_start handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_start")).toBe(true);
  });

  it("registers agent_end handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_end")).toBe(true);
  });
});
