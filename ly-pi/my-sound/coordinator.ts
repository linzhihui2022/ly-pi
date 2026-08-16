import { type ChildProcess, exec } from "node:child_process";

export function onExecDone(): void {
  // exec callback; errors ignored because process may have been killed intentionally
}

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const GLOBAL_SOUND_DIR = join(homedir(), ".pi", "my-sound");
export const DEFAULT_PID_FILE = join(GLOBAL_SOUND_DIR, "playing.json");
export const DEFAULT_LOCK_DIR = join(GLOBAL_SOUND_DIR, ".lock");
export const DEFAULT_SOUND_PID_FILE = join(GLOBAL_SOUND_DIR, "sound-pids.json");
export const DEFAULT_SOUND_LOCK_DIR = join(GLOBAL_SOUND_DIR, ".sound-lock");

interface CoordinatorState {
  pids: number[];
  version: number;
  updatedAt: number;
}

export interface LockOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export function ensureGlobalDir(dir: string = GLOBAL_SOUND_DIR): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function acquireGlobalLock(
  lockDir: string = DEFAULT_LOCK_DIR,
  options: LockOptions = {},
): void {
  ensureGlobalDir();
  const { maxRetries = 500, retryDelayMs = 10 } = options;
  let attempts = 0;
  while (true) {
    try {
      mkdirSync(lockDir, { recursive: false });
      return;
    } catch {
      if (attempts >= maxRetries) {
        throw new Error(`[my-sound] Failed to acquire global lock: ${lockDir}`);
      }
      attempts++;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        retryDelayMs,
      );
    }
  }
}

export function releaseGlobalLock(lockDir: string = DEFAULT_LOCK_DIR): void {
  try {
    rmdirSync(lockDir);
  } catch {
    // intentionally ignored
  }
}

export function withGlobalLock<T>(
  fn: () => T,
  lockDir: string = DEFAULT_LOCK_DIR,
): T {
  acquireGlobalLock(lockDir);
  try {
    return fn();
  } finally {
    releaseGlobalLock(lockDir);
  }
}

export function killPlayingProcesses(
  pidFile: string = DEFAULT_PID_FILE,
  lockDir: string = DEFAULT_LOCK_DIR,
): void {
  withGlobalLock(() => {
    let state: CoordinatorState | undefined;
    try {
      state = JSON.parse(readFileSync(pidFile, "utf-8")) as CoordinatorState;
    } catch {
      return;
    }
    for (const pid of state.pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already dead or not ours; intentionally ignored
      }
    }
  }, lockDir);
}

export function recordPids(
  pids: number[],
  pidFile: string = DEFAULT_PID_FILE,
  lockDir: string = DEFAULT_LOCK_DIR,
): void {
  withGlobalLock(() => {
    ensureGlobalDir();
    const state: CoordinatorState = {
      pids,
      version: 1,
      updatedAt: Date.now(),
    };
    writeFileSync(pidFile, JSON.stringify(state, null, 2));
  }, lockDir);
}

export function spawnSoundProcess(
  filePath: string,
  runtimeDir: string = GLOBAL_SOUND_DIR,
): ChildProcess {
  const pidFile = join(runtimeDir, "sound-pids.json");
  const lockDir = join(runtimeDir, ".sound-lock");
  killPlayingProcesses(pidFile, lockDir);
  const child = exec(`afplay "${filePath}"`, onExecDone);
  if (child.pid) {
    recordPids([child.pid], pidFile, lockDir);
  }
  return child;
}
