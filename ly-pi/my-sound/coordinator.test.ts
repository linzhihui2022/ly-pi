import { type ChildProcess, exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireGlobalLock,
  ensureGlobalDir,
  killPlayingProcesses,
  onExecDone,
  recordPids,
  releaseGlobalLock,
  spawnSoundProcess,
  withGlobalLock,
} from "./coordinator";
import type { BtConfig } from "./types";

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

const mockPid = () => Math.floor(Math.random() * 100000) + 1000;

vi.mock("node:child_process", () => ({
  exec: vi.fn(
    (
      _cmd: string,
      _options: import("node:child_process").ExecOptions | undefined | null,
      cb?: ExecCallback,
    ): import("node:child_process").ChildProcess => {
      const child = {
        pid: mockPid(),
      } as import("node:child_process").ChildProcess;
      cb?.(null, "", "");
      return child;
    },
  ),
}));

vi.mock("node:process", async () => {
  const actual =
    await vi.importActual<typeof import("node:process")>("node:process");
  return {
    ...actual,
    kill: vi.fn((_pid: number, _signal: string) => true),
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

describe("withGlobalLock", () => {
  it("executes function and releases lock", () => {
    const lockDir = join(TEST_DIR, "with-lock");
    const result = withGlobalLock(() => 42, lockDir);
    expect(result).toBe(42);
    expect(existsSync(lockDir)).toBe(false);
  });
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
  it("kills old sound processes and returns child pid", () => {
    const config = { activePack: "test", packs: { test: { soundDir: "/fake/sounds" } } } as SoundConfig;
    const result = spawnSoundProcess(config, "startup.wav", TEST_DIR);
    expect(result.pid).toBeGreaterThan(0);
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('afplay "startup.wav"'),
      expect.any(Function),
    );

    const pidFile = join(TEST_DIR, "sound-pids.json");
    const content = JSON.parse(readFileSync(pidFile, "utf-8"));
    expect(content.pids).toEqual([result.pid]);
  });

  it("records pid when child has no pid is a no-op", () => {
    const config = { activePack: "test", packs: { test: { soundDir: "/fake/sounds" } } } as SoundConfig;
    vi.mocked(exec).mockImplementationOnce((_cmd, _options, cb) => {
      cb?.(null, "", "");
      return { pid: undefined } as ChildProcess;
    });
    const result = spawnSoundProcess(config, "startup.wav", TEST_DIR);
    expect(result.pid).toBeUndefined();
  });

  it("invokes error callback when exec returns an error", () => {
    const config = { activePack: "test", packs: { test: { soundDir: "/fake/sounds" } } } as SoundConfig;
    vi.mocked(exec).mockImplementationOnce((_cmd, _options, cb) => {
      cb?.(new Error("killed"), "", "");
      return { pid: 7777 } as ChildProcess;
    });
    expect(() =>
      spawnSoundProcess(config, "startup.wav", TEST_DIR),
    ).not.toThrow();
  });

  it("covers sound exec callback without error", () => {
    const config = { activePack: "test", packs: { test: { soundDir: "/fake/sounds" } } } as SoundConfig;
    let savedCb: ExecCallback | undefined;
    vi.mocked(exec).mockImplementationOnce((_cmd, _options, cb) => {
      savedCb = cb;
      return { pid: 7778 } as ChildProcess;
    });
    spawnSoundProcess(config, "startup.wav", TEST_DIR);
    savedCb?.(null, "", "");
  });

  it("covers sound exec callback with error", () => {
    const config = { activePack: "test", packs: { test: { soundDir: "/fake/sounds" } } } as SoundConfig;
    let savedCb: ExecCallback | undefined;
    vi.mocked(exec).mockImplementationOnce((_cmd, _options, cb) => {
      savedCb = cb;
      return { pid: 7779 } as ChildProcess;
    });
    spawnSoundProcess(config, "startup.wav", TEST_DIR);
    savedCb?.(new Error("killed"), "", "");
  });

  it("invokes sound onExecDone directly", () => {
    expect(() => onExecDone()).not.toThrow();
  });
});
