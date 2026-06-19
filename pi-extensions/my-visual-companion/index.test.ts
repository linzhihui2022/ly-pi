import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Mutable references for mock callbacks
const mockManager = { destroyAll: vi.fn() };
let mockToolExecute: ReturnType<typeof vi.fn>;

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({ idleTimeoutMinutes: 30 })),
}));

vi.mock("./session", () => ({
  SessionManager: class MockSessionManager {
    destroyAll = mockManager.destroyAll;
  },
}));

vi.mock("./tools", () => ({
  createTools: vi.fn().mockImplementation(() => {
    mockToolExecute = vi.fn();
    return [
      { name: "visual_companion_start", execute: mockToolExecute },
      { name: "visual_companion_show", execute: mockToolExecute },
      { name: "visual_companion_wait", execute: mockToolExecute },
      { name: "visual_companion_read_events", execute: mockToolExecute },
      { name: "visual_companion_stop", execute: mockToolExecute },
    ];
  }),
}));

describe("my-visual-companion extension", () => {
  const registeredEvents = new Map<string, (...args: any[]) => any>();
  const registeredCommands = new Map<string, any>();

  const mockPi = {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      registeredEvents.set(event, handler);
    }),
    registerCommand: vi.fn((name: string, opts: any) => {
      registeredCommands.set(name, opts);
    }),
    registerTool: vi.fn(),
  };

  beforeEach(() => {
    registeredEvents.clear();
    registeredCommands.clear();
    vi.clearAllMocks();
    mockManager.destroyAll.mockReset();
  });

  async function loadAndRegister() {
    const mod = await import("./index");
    mod.default(mockPi as any);
  }

  it("registers 5 LLM tools", async () => {
    await loadAndRegister();
    expect(mockPi.registerTool).toHaveBeenCalledTimes(5);
  });

  it("registers 5 slash commands and 2 events", async () => {
    await loadAndRegister();
    expect(registeredCommands.size).toBe(5);
    expect(registeredCommands.has("vc-start")).toBe(true);
    expect(registeredCommands.has("vc-show")).toBe(true);
    expect(registeredCommands.has("vc-wait")).toBe(true);
    expect(registeredCommands.has("vc-events")).toBe(true);
    expect(registeredCommands.has("vc-stop")).toBe(true);
    expect(mockPi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(mockPi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
  });

  it("resolveExtDir returns __dirname", async () => {
    vi.resetModules();
    const mod = await import("./index");
    expect(mod.resolveExtDir()).toBe(__dirname);
  });

  it("uses default idle timeout when config value is zero", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ idleTimeoutMinutes: 0, defaultHost: "127.0.0.1", defaultUrlHost: "localhost" }));
    await loadAndRegister();
    expect(mockPi.registerCommand).toHaveBeenCalled();
  });

  it("session_shutdown calls manager.destroyAll", async () => {
    await loadAndRegister();
    const shutdownHandler = registeredEvents.get("session_shutdown");
    await shutdownHandler?.({ type: "session_shutdown", reason: "quit" });
    expect(mockManager.destroyAll).toHaveBeenCalled();
  });

});

describe("command handlers", () => {
  const registeredCommands = new Map<string, any>();
  const mockNotify = vi.fn();

  const mockPi = {
    on: vi.fn(),
    registerCommand: vi.fn((name: string, opts: any) => {
      registeredCommands.set(name, opts);
    }),
    registerTool: vi.fn(),
  };

  beforeEach(() => {
    registeredCommands.clear();
    vi.clearAllMocks();
    mockManager.destroyAll.mockReset();
  });

  async function loadAndGetCommand(name: string) {
    const mod = await import("./index");
    mod.default(mockPi as any);
    return registeredCommands.get(name);
  }

  describe("vc-start", () => {
    it("executes start tool and notifies", async () => {
      const cmd = await loadAndGetCommand("vc-start");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Started at http://localhost:6000 (session: abc123)" }],
        details: {},
      });

      await cmd.handler("", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(
        "Started at http://localhost:6000 (session: abc123)",
        "info",
      );
    });
  });

  describe("vc-show", () => {
    it("notifies usage when no args", async () => {
      const cmd = await loadAndGetCommand("vc-show");
      await cmd.handler("", { ui: { notify: mockNotify } });
      expect(mockNotify).toHaveBeenCalledWith(
        "Usage: /vc-show <session_id> <name> <html>",
        "warning",
      );
    });

    it("executes show tool with parsed args", async () => {
      const cmd = await loadAndGetCommand("vc-show");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Screen shown" }],
        details: {},
      });

      await cmd.handler("session1 layout <h1>Hello</h1>", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalledWith(
        "cmd-show",
        { session_id: "session1", name: "layout", html: "<h1>Hello</h1>" },
        undefined,
        undefined,
        expect.anything(),
      );
      expect(mockNotify).toHaveBeenCalledWith("Screen shown", "info");
    });

    it("uses default name when only session_id is provided", async () => {
      const cmd = await loadAndGetCommand("vc-show");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Screen shown" }],
        details: {},
      });

      await cmd.handler("session1", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalledWith(
        "cmd-show",
        { session_id: "session1", name: "screen", html: "" },
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it("notifies as error when tool returns error details", async () => {
      const cmd = await loadAndGetCommand("vc-show");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Error: something went wrong" }],
        details: { error: "something went wrong" },
      });

      await cmd.handler("bad session html", { ui: { notify: mockNotify } });

      expect(mockNotify).toHaveBeenCalledWith("Error: something went wrong", "error");
    });
  });

  describe("vc-wait", () => {
    it("notifies usage when no session_id", async () => {
      const cmd = await loadAndGetCommand("vc-wait");
      await cmd.handler("", { ui: { notify: mockNotify } });
      expect(mockNotify).toHaveBeenCalledWith("Usage: /vc-wait <session_id>", "warning");
    });

    it("notifies usage when only whitespace", async () => {
      const cmd = await loadAndGetCommand("vc-wait");
      await cmd.handler("   ", { ui: { notify: mockNotify } });
      expect(mockNotify).toHaveBeenCalledWith("Usage: /vc-wait <session_id>", "warning");
    });

    it("executes wait tool and notifies on success", async () => {
      const cmd = await loadAndGetCommand("vc-wait");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Confirmed: option-a" }],
        details: {},
      });

      await cmd.handler("session1", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalledWith(
        "cmd-wait",
        { session_id: "session1", timeout_ms: 300000 },
        undefined,
        undefined,
        expect.anything(),
      );
      expect(mockNotify).toHaveBeenCalledWith("Confirmed: option-a", "info");
    });

    it("notifies as error when wait times out", async () => {
      const cmd = await loadAndGetCommand("vc-wait");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Error: timeout" }],
        details: { error: "timeout" },
      });

      await cmd.handler("session1", { ui: { notify: mockNotify } });

      expect(mockNotify).toHaveBeenCalledWith("Error: timeout", "error");
    });
  });

  describe("vc-events", () => {
    it("notifies usage when no session_id", async () => {
      const cmd = await loadAndGetCommand("vc-events");
      await cmd.handler("", { ui: { notify: mockNotify } });
      expect(mockNotify).toHaveBeenCalledWith("Usage: /vc-events <session_id>", "warning");
    });

    it("executes read_events tool and notifies result", async () => {
      const cmd = await loadAndGetCommand("vc-events");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Events:\n- click: button1" }],
        details: {},
      });

      await cmd.handler("session1", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalledWith(
        "cmd-events",
        { session_id: "session1" },
        undefined,
        undefined,
        expect.anything(),
      );
      expect(mockNotify).toHaveBeenCalledWith("Events:\n- click: button1", "info");
    });
  });

  describe("vc-stop", () => {
    it("notifies usage when no session_id", async () => {
      const cmd = await loadAndGetCommand("vc-stop");
      await cmd.handler("", { ui: { notify: mockNotify } });
      expect(mockNotify).toHaveBeenCalledWith("Usage: /vc-stop <session_id>", "warning");
    });

    it("executes stop tool and notifies", async () => {
      const cmd = await loadAndGetCommand("vc-stop");
      mockToolExecute.mockResolvedValue({
        content: [{ type: "text", text: "Visual Companion session stopped." }],
        details: {},
      });

      await cmd.handler("session1", { ui: { notify: mockNotify } });

      expect(mockToolExecute).toHaveBeenCalledWith(
        "cmd-stop",
        { session_id: "session1" },
        undefined,
        undefined,
        expect.anything(),
      );
      expect(mockNotify).toHaveBeenCalledWith("Visual Companion session stopped.", "info");
    });
  });
});
