import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { playCategory } from "./player";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));



vi.mock("./player", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./player")>();
  return {
    ...actual,
    playCategory: vi.fn(),
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
const mockNotify = vi.fn();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerCommand: vi.fn((name: string, opts: any) => {
    registeredCommands.set(name, opts);
  }),
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
    mockNotify.mockClear();
    mockPi.on.mockClear();
    mockPi.registerCommand.mockClear();
    vi.mocked(readFileSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(playCategory).mockClear();
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
    handler?.();
    expect(playCategory).toHaveBeenCalled();
  });

  it("does not play sound on event when disabled", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ ...DEFAULT_CONFIG, enabled: false }),
    );
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("session_start");
    handler?.();
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
    const saved = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
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
    const saved = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
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
      "warn",
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
      "warn",
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
});
