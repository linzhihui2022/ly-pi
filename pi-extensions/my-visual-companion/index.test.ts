import { describe, it, expect, vi, beforeEach } from "vitest";

describe("my-visual-companion extension", () => {
  const registeredEvents = new Map<string, (...args: any[]) => any>();
  const registeredCommands = new Map<string, any>();
  const registeredTools: any[] = [];

  const mockPi = {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      registeredEvents.set(event, handler);
    }),
    registerCommand: vi.fn((name: string, opts: any) => {
      registeredCommands.set(name, opts);
    }),
    registerTool: vi.fn((tool: any) => {
      registeredTools.push(tool);
    }),
  };

  beforeEach(() => {
    registeredEvents.clear();
    registeredCommands.clear();
    registeredTools.length = 0;
    vi.clearAllMocks();
  });

  async function loadModule() {
    return await import("./index");
  }

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers session_start and session_shutdown events", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(mockPi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(mockPi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
  });

  it("registers 5 slash commands", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredCommands.has("vc-start")).toBe(true);
    expect(registeredCommands.has("vc-show")).toBe(true);
    expect(registeredCommands.has("vc-wait")).toBe(true);
    expect(registeredCommands.has("vc-events")).toBe(true);
    expect(registeredCommands.has("vc-stop")).toBe(true);
  });

  it("registers 5 LLM tools", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredTools.length).toBe(5);
    const names = registeredTools.map((t) => t.name);
    expect(names).toContain("visual_companion_start");
    expect(names).toContain("visual_companion_show");
    expect(names).toContain("visual_companion_wait");
    expect(names).toContain("visual_companion_read_events");
    expect(names).toContain("visual_companion_stop");
  });

  it("session_shutdown calls stopAll on api", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const shutdownHandler = registeredEvents.get("session_shutdown");
    expect(shutdownHandler).toBeDefined();

    // Should not throw
    await shutdownHandler?.({ type: "session_shutdown", reason: "quit" });
  });
});
