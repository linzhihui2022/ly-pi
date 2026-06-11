import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exec } from "node:child_process";
import { listCategories, pickSoundFile, resolveSoundPath, playCategory, playOverlay, detectTerminal } from "./player";
import type { BtConfig } from "./types";

vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd: string, cb: (err: Error | null) => void) => {
    cb(null);
  }),
}));

const mockConfig: BtConfig = {
  enabled: true,
  soundDir: "/fake/sounds",
  categories: {
    startup: {
      description: "BT-7274 startup",
      files: ["startup.mp3"],
    },
    affirmative: {
      description: "Affirmative response",
      files: ["affirm_1.mp3", "affirm_2.mp3"],
    },
    warning: {
      description: "Warning alert",
      files: ["warning.mp3"],
    },
    engaging: {
      description: "Engaging",
      files: ["engage.mp3"],
    },
    completed: {
      description: "Task completed",
      files: ["done.mp3"],
    },
    error: {
      description: "Error occurred",
      files: ["error_1.mp3", "error_2.mp3"],
    },
  },
  eventMap: {
    session_start: "startup",
    agent_start: "engaging",
    agent_end: "completed",
  },
  overlayTextMap: {
    session_start: { type: "SESSION START", title: "BT-7274 已上线", subtitle: "系统重启" },
    agent_start: { type: "MISSION", title: "执行任务", subtitle: "铁御控制" },
    agent_end: { type: "COMPLETE", title: "任务完成" },
    turn_start: { type: "TURN", title: "新回合" },
  },
};

beforeEach(() => {
  vi.mocked(exec).mockClear();
});

describe("playCategory", () => {
  it("plays a sound from the category", () => {
    playCategory(mockConfig, "startup");
    expect(exec).toHaveBeenCalledOnce();
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("startup.mp3"),
      expect.any(Function),
    );
  });

  it("does nothing for unknown category", () => {
    playCategory(mockConfig, "nonexistent");
    expect(exec).not.toHaveBeenCalled();
  });

  it("logs error when play fails", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      cb(new Error("play failed"));
    });
    playCategory(mockConfig, "startup");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("play failed"),
    );
    consoleSpy.mockRestore();
  });
});

describe("listCategories", () => {
  it("returns all category names and descriptions", () => {
    const result = listCategories(mockConfig);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ name: "startup", description: "BT-7274 startup" });
    expect(result[1]).toEqual({ name: "affirmative", description: "Affirmative response" });
  });
});

describe("pickSoundFile", () => {
  it("returns the only file when single file exists", () => {
    const result = pickSoundFile(mockConfig, "startup");
    expect(result).toBe("startup.mp3");
  });

  it("returns one of the files when multiple exist", () => {
    // Run multiple times to verify it's deterministic (not random)
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      results.add(pickSoundFile(mockConfig, "affirmative"));
    }
    // With 2 files, both should appear over 20 runs
    expect(results.has("affirm_1.mp3")).toBe(true);
    expect(results.has("affirm_2.mp3")).toBe(true);
  });

  it("returns undefined for unknown category", () => {
    const result = pickSoundFile(mockConfig, "nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("resolveSoundPath", () => {
  it("resolves a file relative to soundDir", () => {
    const result = resolveSoundPath(mockConfig, "startup.mp3");
    expect(result).toBe("/fake/sounds/startup.mp3");
  });
});

describe("playOverlay", () => {
  const extDir = "/fake/ext";

  it("spawns osascript with correct arguments for session_start", () => {
    playOverlay(mockConfig, "session_start", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("osascript -l JavaScript");
    expect(cmd).toContain("dist/mac-overlay.js");
    expect(cmd).toContain("SESSION START");
    expect(cmd).toContain("BT-7274 已上线");
    expect(cmd).toContain("系统重启");
    expect(cmd).toContain("5");
    expect(cmd).toContain("blue");
    expect(cmd).toContain("WezTerm");
  });

  it("spawns osascript with orange color for agent_start", () => {
    playOverlay(mockConfig, "agent_start", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("orange");
    expect(cmd).toContain("MISSION");
    expect(cmd).toContain("铁御控制");
  });

  it("omits subtitle when not configured", () => {
    playOverlay(mockConfig, "agent_end", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("COMPLETE");
    expect(cmd).toContain("任务完成");
    // subtitle should be empty string ""
    expect(cmd).toMatch(/"任务完成" "" /);
  });

  it("defaults to blue when event is not in EVENT_COLOR_MAP", () => {
    // turn_start is in overlayTextMap but not in EVENT_COLOR_MAP
    playOverlay(mockConfig, "turn_start", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("blue");
  });

  it("no-ops when event has no overlay config", () => {
    const before = vi.mocked(exec).mock.calls.length;
    playOverlay(mockConfig, "session_shutdown", extDir);
    expect(vi.mocked(exec).mock.calls.length).toBe(before);
  });

  it("cycles through slot 0-4 and wraps", async () => {
    // Reset module to start with fresh slot counter
    vi.resetModules();
    const freshPlayer = await import("./player");
    const before = vi.mocked(exec).mock.calls.length;
    for (let i = 0; i < 7; i++) {
      freshPlayer.playOverlay(mockConfig, "session_start", extDir);
    }
    // Slots: 0,1,2,3,4,0,1 → last should be slot 1
    const lastCall = vi.mocked(exec).mock.calls[before + 6];
    const cmd = lastCall[0] as string;
    expect(cmd).toMatch(/blue"\s+1\s+"WezTerm"/);
  });

  it("no-ops when overlayTextMap is missing", () => {
    const cfgNoOverlay: BtConfig = {
      ...mockConfig,
      overlayTextMap: undefined,
    };
    const before = vi.mocked(exec).mock.calls.length;
    playOverlay(cfgNoOverlay, "session_start", extDir);
    expect(vi.mocked(exec).mock.calls.length).toBe(before);
  });

  it("no-ops when event has no overlay config", () => {
    const before = vi.mocked(exec).mock.calls.length;
    playOverlay(mockConfig, "tool_call", extDir);
    expect(vi.mocked(exec).mock.calls.length).toBe(before);
  });

  it("uses red color for permissions_ui_prompt", () => {
    const configWithPermissionOverlay: BtConfig = {
      ...mockConfig,
      overlayTextMap: {
        permissions_ui_prompt: { type: "WARNING", title: "侦测到危险操作", subtitle: "铁御，请确认权限" },
      },
    };
    playOverlay(configWithPermissionOverlay, "permissions_ui_prompt", extDir);
    const lastCall = vi.mocked(exec).mock.calls.at(-1);
    const cmd = lastCall![0] as string;
    expect(cmd).toContain("red");
    expect(cmd).toContain("WARNING");
    expect(cmd).toContain("侦测到危险操作");
    expect(cmd).toContain("铁御，请确认权限");
  });

  it("logs error when osascript fails", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(exec).mockImplementationOnce((_cmd, cb) => {
      if (typeof cb === "function") cb(new Error("osascript failed"));
    });
    playOverlay(mockConfig, "session_start", extDir);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("osascript failed"),
    );
    consoleSpy.mockRestore();
  });
});

describe("detectTerminal", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset cache between tests
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns WezTerm when TERM_PROGRAM is WezTerm", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: "WezTerm", WEZTERM_PANE: undefined, ITERM_SESSION_ID: undefined };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("WezTerm");
  });

  it("returns iTerm when TERM_PROGRAM is iTerm.app", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: "iTerm.app", WEZTERM_PANE: undefined, ITERM_SESSION_ID: undefined };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("iTerm");
  });

  it("returns Terminal when TERM_PROGRAM is Apple_Terminal", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: "Apple_Terminal", WEZTERM_PANE: undefined, ITERM_SESSION_ID: undefined };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("Terminal");
  });

  it("returns WezTerm when WEZTERM_PANE is set", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: undefined, WEZTERM_PANE: "1", ITERM_SESSION_ID: undefined };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("WezTerm");
  });

  it("returns iTerm when ITERM_SESSION_ID is set", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: undefined, WEZTERM_PANE: undefined, ITERM_SESSION_ID: "abc123" };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("iTerm");
  });

  it("defaults to WezTerm when no env vars match", async () => {
    process.env = { ...originalEnv, TERM_PROGRAM: undefined, WEZTERM_PANE: undefined, ITERM_SESSION_ID: undefined };
    vi.resetModules();
    const fresh = await import("./player");
    expect(fresh.detectTerminal()).toBe("WezTerm");
  });
});
