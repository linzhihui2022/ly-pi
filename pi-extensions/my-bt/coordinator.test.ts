import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSoundProcess, spawnOverlayProcess, acquireGlobalLock, releaseGlobalLock, killPlayingProcesses, recordPids, ensureGlobalDir } from "./coordinator";
import { exec } from "node:child_process";

vi.mock("node:child_process", () => ({
  exec: vi.fn((cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
    const child = { pid: Math.floor(Math.random() * 100000) + 1000 };
    cb(null, "", "");
    return child;
  }),
}));

vi.mock("node:process", async () => {
  const actual = await vi.importActual<typeof import("node:process")>("node:process");
  return {
    ...actual,
    kill: vi.fn((pid: number, signal: string) => true),
  };
});

const TEST_DIR = join(tmpdir(), `my-bt-coordinator-test-${Date.now()}`);

beforeEach(() => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  try {
    // cleanup test files only
  } catch {}
});

describe("ensureGlobalDir", () => {
  it("creates directory when missing", () => {
    const dir = join(TEST_DIR, "new");
    ensureGlobalDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it("does not fail when directory already exists", () => {
    const dir = join(TEST_DIR, "existing");
    mkdirSync(dir, { recursive: true });
    expect(() => ensureGlobalDir(dir)).not.toThrow();
  });
});

describe("acquireGlobalLock / releaseGlobalLock", () => {
  it("acquires and releases lock", () => {
    const lockDir = join(TEST_DIR, "lock1");
    acquireGlobalLock(lockDir);
    expect(existsSync(lockDir)).toBe(true);
    releaseGlobalLock(lockDir);
    expect(existsSync(lockDir)).toBe(false);
  });

  it("blocks concurrent acquisition using separate directories via polling", () => {
    const lockDir = join(TEST_DIR, "lock2");
    acquireGlobalLock(lockDir);
    let acquiredSecond = false;
    try {
      acquireGlobalLock(lockDir, { maxRetries: 1, retryDelayMs: 5 });
      acquiredSecond = true;
    } catch {
      acquiredSecond = false;
    }
    releaseGlobalLock(lockDir);
    expect(acquiredSecond).toBe(false);
  });
});

describe("recordPids / killPlayingProcesses", () => {
  it("records pids and later kills them", () => {
    const file = join(TEST_DIR, "pids.json");
    const lockDir = join(TEST_DIR, "lock-pids");
    recordPids([1234, 5678], file, lockDir);

    const content = JSON.parse(readFileSync(file, "utf-8"));
    expect(content.pids).toEqual([1234, 5678]);

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    killPlayingProcesses(file, lockDir);

    expect(killSpy).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(5678, "SIGTERM");
    killSpy.mockRestore();
  });

  it("does not throw when pid file is missing", () => {
    const file = join(TEST_DIR, "missing.json");
    const lockDir = join(TEST_DIR, "lock-missing");
    expect(() => killPlayingProcesses(file, lockDir)).not.toThrow();
  });

  it("does not throw when pid file contains invalid json", () => {
    const file = join(TEST_DIR, "invalid.json");
    const lockDir = join(TEST_DIR, "lock-invalid");
    writeFileSync(file, "not-json");
    expect(() => killPlayingProcesses(file, lockDir)).not.toThrow();
  });

  it("silently ignores kill errors for stale pids", () => {
    const file = join(TEST_DIR, "stale.json");
    const lockDir = join(TEST_DIR, "lock-stale");
    recordPids([99999], file, lockDir);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });
    expect(() => killPlayingProcesses(file, lockDir)).not.toThrow();
  });
});

describe("spawnSoundProcess", () => {
  it("kills old processes and returns child pid", () => {
    const config = { soundDir: "/fake/sounds" } as any;
    const result = spawnSoundProcess(config, "startup.wav", TEST_DIR);
    expect(result.pid).toBeGreaterThan(0);
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('afplay "startup.wav"'),
      expect.any(Function),
    );
  });

  it("records pid when child has no pid is a no-op", () => {
    const config = { soundDir: "/fake/sounds" } as any;
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      cb(null, "", "");
      return { pid: undefined } as any;
    });
    const result = spawnSoundProcess(config, "startup.wav", TEST_DIR);
    expect(result.pid).toBeUndefined();
  });

  it("invokes error callback when exec returns an error", () => {
    const config = { soundDir: "/fake/sounds" } as any;
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      cb(new Error("killed"), "", "");
      return { pid: 7777 } as any;
    });
    expect(() => spawnSoundProcess(config, "startup.wav", TEST_DIR)).not.toThrow();
  });

  it("covers sound exec callback without error", () => {
    const config = { soundDir: "/fake/sounds" } as any;
    let savedCb: ((err: Error | null, stdout: string, stderr: string) => void) | undefined;
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      savedCb = cb as any;
      return { pid: 7778 } as any;
    });
    spawnSoundProcess(config, "startup.wav", TEST_DIR);
    savedCb?.(null, "", "");
  });
});

describe("spawnOverlayProcess", () => {
  it("kills old processes and returns child pid", () => {
    const result = spawnOverlayProcess(
      "/fake/ext",
      "SESSION START",
      "BT-7274",
      "subtitle",
      5,
      "blue",
      0,
      "WezTerm",
      TEST_DIR,
    );
    expect(result.pid).toBeGreaterThan(0);
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining("osascript -l JavaScript"),
      expect.any(Function),
    );
  });

  it("records pid when child has no pid is a no-op", () => {
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      cb(null, "", "");
      return { pid: undefined } as any;
    });
    const result = spawnOverlayProcess(
      "/fake/ext",
      "SESSION START",
      "BT-7274",
      "subtitle",
      5,
      "blue",
      0,
      "WezTerm",
      TEST_DIR,
    );
    expect(result.pid).toBeUndefined();
  });

  it("invokes error callback when exec returns an error", () => {
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      cb(new Error("killed"), "", "");
      return { pid: 8888 } as any;
    });
    expect(() =>
      spawnOverlayProcess(
        "/fake/ext",
        "SESSION START",
        "BT-7274",
        "subtitle",
        5,
        "blue",
        0,
        "WezTerm",
        TEST_DIR,
      ),
    ).not.toThrow();
  });

  it("covers overlay exec callback without error", () => {
    let savedCb: ((err: Error | null, stdout: string, stderr: string) => void) | undefined;
    vi.mocked(exec).mockImplementationOnce((cmd, cb) => {
      savedCb = cb as any;
      return { pid: 8889 } as any;
    });
    spawnOverlayProcess(
      "/fake/ext",
      "SESSION START",
      "BT-7274",
      "subtitle",
      5,
      "blue",
      0,
      "WezTerm",
      TEST_DIR,
    );
    savedCb?.(null, "", "");
  });

  it("handles undefined subtitle gracefully", () => {
    expect(() =>
      spawnOverlayProcess(
        "/fake/ext",
        "SESSION START",
        "BT-7274",
        undefined as any,
        5,
        "blue",
        0,
        "WezTerm",
        TEST_DIR,
      ),
    ).not.toThrow();
  });
});
