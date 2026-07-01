import { exec, type ChildProcess } from "node:child_process";

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
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { BtConfig } from "./types";

export const GLOBAL_BT_DIR = join(homedir(), ".my-bt");
export const DEFAULT_PID_FILE = join(GLOBAL_BT_DIR, "playing.json");
export const DEFAULT_LOCK_DIR = join(GLOBAL_BT_DIR, ".lock");
export const DEFAULT_SOUND_PID_FILE = join(GLOBAL_BT_DIR, "sound-pids.json");
export const DEFAULT_OVERLAY_PID_FILE = join(GLOBAL_BT_DIR, "overlay-pids.json");
export const DEFAULT_SOUND_LOCK_DIR = join(GLOBAL_BT_DIR, ".sound-lock");
export const DEFAULT_OVERLAY_LOCK_DIR = join(GLOBAL_BT_DIR, ".overlay-lock");

interface CoordinatorState {
  pids: number[];
  version: number;
  updatedAt: number;
}

export interface LockOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export function ensureGlobalDir(dir: string = GLOBAL_BT_DIR): void {
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
        throw new Error(`[my-bt] Failed to acquire global lock: ${lockDir}`);
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
  _config: BtConfig,
  filePath: string,
  runtimeDir: string = GLOBAL_BT_DIR,
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

export function spawnOverlayProcess(
  extDir: string,
  type: string,
  title: string,
  subtitle: string,
  duration: number,
  color: string,
  slot: number,
  terminalApp: string,
  runtimeDir: string = GLOBAL_BT_DIR,
): ChildProcess {
  const pidFile = join(runtimeDir, "overlay-pids.json");
  const lockDir = join(runtimeDir, ".overlay-lock");
  killPlayingProcesses(pidFile, lockDir);
  const scriptPath = join(extDir, "dist", "mac-overlay.js");
  const child = exec(
    `osascript -l JavaScript "${scriptPath}" ` +
      `"${type}" "${title}" "${subtitle ?? ""}" ` +
      `${duration} "${color}" ${slot} "${terminalApp}"`,
    onExecDone,
  );
  if (child.pid) {
    recordPids([child.pid], pidFile, lockDir);
  }
  return child;
}
