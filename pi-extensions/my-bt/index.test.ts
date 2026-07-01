import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { playCategory, playOverlay } from "./player";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("./player", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./player")>();
  return {
    ...actual,
    playCategory: vi.fn(),
    playOverlay: vi.fn(),
  };
});

const DEFAULT_CONFIG = {
  enabled: true,
  soundDir: "sounds",
  categories: {
    startup: { description: "BT-7274 startup", files: ["startup.mp3"] },
    engaging: { description: "Engaging", files: ["engage.mp3"] },
    completed: { description: "Task completed", files: ["done.mp3"] },
  },
  eventMap: {
    session_start: "startup",
    agent_start: "engaging",
    agent_end: "completed",
  },
};

const registeredEvents = new Map<string, (...args: any[]) => any>();
const registeredCommands = new Map<string, any>();
const registeredPermissionEvents = new Map<string, (...args: any[]) => any>();
const mockNotify = vi.fn();

const mockEvents = {
  on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    registeredPermissionEvents.set(channel, handler);
  }),
  emit: vi.fn(),
};

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerCommand: vi.fn((name: string, opts: any) => {
    registeredCommands.set(name, opts);
  }),
  events: mockEvents,
};

const mockCtx = {
  ui: { notify: mockNotify },
};

async function loadModule() {
  return await import("./index");
}

describe("my-bt extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    registeredCommands.clear();
    registeredPermissionEvents.clear();
    mockNotify.mockClear();
    mockPi.on.mockClear();
    mockPi.registerCommand.mockClear();
    mockEvents.on.mockClear();
    mockEvents.emit.mockClear();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(playCategory).mockClear();
    vi.mocked(playOverlay).mockClear();
    vi.resetModules();
  });

  it("exports a default function", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers /bt command", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredCommands.has("bt")).toBe(true);
  });

  it("registers session_start handler", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("session_start")).toBe(true);
  });

  it("registers agent_start handler", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_start")).toBe(true);
  });

  it("registers agent_end handler", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_end")).toBe(true);
  });

  it("plays sound on event when enabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.({}, mockCtx as any);
    expect(playCategory).toHaveBeenCalled();
  });

  it("does not play sound on event when disabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ ...DEFAULT_CONFIG, enabled: false }),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.({}, mockCtx as any);
    expect(playCategory).not.toHaveBeenCalled();
  });

  it("toggles off via /bt off and persists", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("off", mockCtx as any);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("已关闭"),
      "info",
    );
    expect(writeFileSync).toHaveBeenCalledOnce();
    const saved = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(saved.enabled).toBe(false);
  });

  it("toggles on via /bt on and persists", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ ...DEFAULT_CONFIG, enabled: false }),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("on", mockCtx as any);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("已开启"),
      "info",
    );
    expect(writeFileSync).toHaveBeenCalledOnce();
    const saved = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(saved.enabled).toBe(true);
  });

  it("does not play category when disabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ ...DEFAULT_CONFIG, enabled: false }),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("startup", mockCtx as any);
    expect(playCategory).not.toHaveBeenCalled();
  });

  it("silently exits when config is invalid", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredCommands.has("bt")).toBe(false);
    expect(registeredEvents.size).toBe(0);
  });

  it("lists categories when /bt is called without args", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler(undefined, mockCtx as any);

    expect(mockNotify).toHaveBeenCalledOnce();
    const msg = mockNotify.mock.calls[0][0] as string;
    expect(msg).toContain("startup");
    expect(msg).toContain("engaging");
    expect(msg).toContain("completed");
    expect(msg).toContain("/bt on");
    expect(msg).toContain("/bt off");
  });

  it("plays all categories via /bt all", async () => {
    vi.useFakeTimers();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("all", mockCtx as any);

    expect(playCategory).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    expect(playCategory).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1500);
    expect(playCategory).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("warns when /bt all is called while disabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ ...DEFAULT_CONFIG, enabled: false }),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("all", mockCtx as any);

    expect(playCategory).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("已关闭"),
      "warning",
    );
  });

  it("plays specific category when enabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("startup", mockCtx as any);

    expect(playCategory).toHaveBeenCalledWith(
      expect.objectContaining({ soundDir: expect.any(String) }),
      "startup",
      expect.any(Function),
    );
  });

  it("warns for unknown category", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("nope", mockCtx as any);

    expect(playCategory).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("未知分类"),
      "warning",
    );
  });

  it("notifies error when reloading config fails in handler", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    // Now make loadConfig fail on next call
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("not found");
    });

    const cmd = registeredCommands.get("bt");
    await cmd.handler("startup", mockCtx as any);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining("Config not found or invalid"),
      "error",
    );
  });

  // ── Overlay integration tests ──

  it("calls playOverlay on event when overlayTextMap is configured", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
        agent_start: { type: "GO", title: "Engaging" },
        agent_end: { type: "DONE", title: "Complete" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.({}, mockCtx as any);
    expect(playOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ overlayTextMap: expect.any(Object) }),
      "session_start",
      expect.any(String),
      expect.any(Function),
    );
  });

  it("does not call playOverlay when disabled", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      enabled: false,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.({}, mockCtx as any);
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not call playOverlay on /bt manual playback", async () => {
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        session_start: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("startup", mockCtx as any);

    expect(playCategory).toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not call playOverlay on /bt all", async () => {
    vi.useFakeTimers();
    const configWithOverlay = {
      ...DEFAULT_CONFIG,
      overlayTextMap: {
        startup: { type: "START", title: "BT online" },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithOverlay));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const cmd = registeredCommands.get("bt");
    await cmd.handler("all", mockCtx as any);
    vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(1500);

    expect(playCategory).toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("still works when overlayTextMap is absent (no regression)", async () => {
    // DEFAULT_CONFIG has no overlayTextMap — should work as before
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    expect(() => handler?.({}, mockCtx as any)).not.toThrow();
    expect(playCategory).toHaveBeenCalled();
  });

  // ── Permission event integration tests ──

  it("subscribes to permissions:ui_prompt via pi.events", async () => {
    const configWithPermission = {
      ...DEFAULT_CONFIG,
      permissionEventMap: {
        "permissions:ui_prompt": "warning",
      },
    };
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify(configWithPermission),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(mockEvents.on).toHaveBeenCalledWith(
      "permissions:ui_prompt",
      expect.any(Function),
    );
  });

  it("plays sound and overlay on permissions:ui_prompt when enabled", async () => {
    const configWithPermission = {
      ...DEFAULT_CONFIG,
      permissionEventMap: {
        "permissions:ui_prompt": "warning",
      },
      overlayTextMap: {
        permissions_ui_prompt: {
          type: "WARNING",
          title: "侦测到危险操作",
          subtitle: "铁御，请确认权限",
        },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify(configWithPermission),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredPermissionEvents.get("permissions:ui_prompt");
    handler?.({
      requestId: "req-1",
      source: "tool_call",
      surface: "bash",
      value: "rm -rf *",
      message: "Dangerous command",
      agentName: null,
      forwarding: null,
    });

    expect(playCategory).toHaveBeenCalledWith(
      expect.objectContaining({ permissionEventMap: expect.any(Object) }),
      "warning",
    );
    expect(playOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ overlayTextMap: expect.any(Object) }),
      "permissions_ui_prompt",
      expect.any(String),
    );
  });

  it("does not play on permissions:ui_prompt when disabled", async () => {
    const configWithPermission = {
      ...DEFAULT_CONFIG,
      enabled: false,
      permissionEventMap: {
        "permissions:ui_prompt": "warning",
      },
    };
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify(configWithPermission),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredPermissionEvents.get("permissions:ui_prompt");
    handler?.({
      requestId: "req-1",
      source: "tool_call",
      surface: "bash",
      value: "rm -rf *",
      message: "Dangerous command",
      agentName: null,
      forwarding: null,
    });

    expect(playCategory).not.toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not play on permissions:ui_prompt when permissionEventMap is missing", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredPermissionEvents.get("permissions:ui_prompt");
    handler?.({
      requestId: "req-1",
      source: "tool_call",
      surface: "bash",
      value: "rm -rf *",
      message: "Dangerous command",
      agentName: null,
      forwarding: null,
    });

    expect(playCategory).not.toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  // ── Tool event integration tests ──

  it("subscribes to tool_call when toolEventMap is configured", async () => {
    const configWithToolEvent = {
      ...DEFAULT_CONFIG,
      toolEventMap: {
        ask_user_question: "question",
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithToolEvent));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("tool_call")).toBe(true);
  });

  it("does not subscribe to tool_call when toolEventMap is missing", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("tool_call")).toBe(false);
  });

  it("plays sound and overlay on tool_call when toolName is mapped", async () => {
    const configWithToolEvent = {
      ...DEFAULT_CONFIG,
      toolEventMap: {
        ask_user_question: "question",
      },
      overlayTextMap: {
        ask_user_question: {
          type: "QUESTION",
          title: "侦测到提问",
          subtitle: "BT-7274 需要你的反馈",
        },
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithToolEvent));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("tool_call");
    handler?.({ toolName: "ask_user_question" }, mockCtx as any);

    expect(playCategory).toHaveBeenCalledWith(
      expect.objectContaining({ toolEventMap: expect.any(Object) }),
      "question",
      expect.any(Function),
    );
    expect(playOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ overlayTextMap: expect.any(Object) }),
      "ask_user_question",
      expect.any(String),
      expect.any(Function),
    );
  });

  it("does not play on tool_call when toolName is not mapped", async () => {
    const configWithToolEvent = {
      ...DEFAULT_CONFIG,
      toolEventMap: {
        ask_user_question: "question",
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithToolEvent));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("tool_call");
    handler?.({ toolName: "bash" }, mockCtx as any);

    expect(playCategory).not.toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });

  it("does not play on tool_call when disabled", async () => {
    const configWithToolEvent = {
      ...DEFAULT_CONFIG,
      enabled: false,
      toolEventMap: {
        ask_user_question: "question",
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithToolEvent));
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("tool_call");
    handler?.({ toolName: "ask_user_question" }, mockCtx as any);

    expect(playCategory).not.toHaveBeenCalled();
    expect(playOverlay).not.toHaveBeenCalled();
  });
});
