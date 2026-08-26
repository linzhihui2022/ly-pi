import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLOSE_WORKTREE_WORKER_READY } from "./close-worker-protocol";
import type { WorktreeClosePlan } from "./closure";

const WORKER_START_TIMEOUT_MS = 5_000;

export interface CloseWorktreeWorkerProcess {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  on(event: "message", listener: (message: unknown) => void): unknown;
  disconnect(): void;
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  unref(): void;
}

export interface CloseWorktreeWorkerLauncherDeps {
  spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      detached: true;
      stdio: ["ignore", "inherit", "inherit", "ipc"];
    },
  ): CloseWorktreeWorkerProcess;
  exists(path: string): boolean;
  nodeExecutable: string;
  processId: number;
  startupTimeoutMs: number;
  workerPath: string;
}

function defaultLauncherDeps(): CloseWorktreeWorkerLauncherDeps {
  return {
    spawn: (command, args, options) => spawn(command, args, options),
    exists: existsSync,
    nodeExecutable: process.execPath,
    processId: process.pid,
    startupTimeoutMs: WORKER_START_TIMEOUT_MS,
    workerPath: join(
      dirname(fileURLToPath(import.meta.url)),
      "close-worktree-worker.js",
    ),
  };
}

function workerExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
): Error {
  const status =
    code === null ? `signal ${signal ?? "unknown"}` : `exit ${code}`;
  return new Error(
    `close-worktree worker exited before reporting readiness (${status}).`,
  );
}

export function startCloseWorktreeWorker(
  plan: WorktreeClosePlan,
  deps = defaultLauncherDeps(),
): Promise<void> {
  if (!deps.exists(deps.workerPath)) {
    return Promise.reject(
      new Error(`close-worktree worker is unavailable at ${deps.workerPath}`),
    );
  }

  const request = JSON.stringify({ piPid: deps.processId, plan });

  return new Promise((resolveStart, rejectStart) => {
    let child: CloseWorktreeWorkerProcess;
    try {
      child = deps.spawn(deps.nodeExecutable, [deps.workerPath, request], {
        cwd: plan.repositoryRoot,
        detached: true,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
    } catch (error) {
      rejectStart(error);
      return;
    }

    let settled = false;
    let startupFailure: unknown;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const rejectAfterExit = (error: unknown): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      rejectStart(error);
    };
    const stopWorker = (error: unknown): void => {
      if (settled || startupFailure !== undefined) return;
      startupFailure = error;
      if (timeout) clearTimeout(timeout);

      try {
        child.kill("SIGKILL");
      } catch {
        // Do not resolve the startup failure until the worker exit event proves it stopped.
      }
    };

    child.once("error", (error) => {
      if (child.pid === undefined) {
        rejectAfterExit(error);
        return;
      }
      stopWorker(error);
    });
    child.once("exit", (code, signal) => {
      rejectAfterExit(startupFailure ?? workerExitError(code, signal));
    });
    child.on("message", (message) => {
      if (
        settled ||
        startupFailure !== undefined ||
        message !== CLOSE_WORKTREE_WORKER_READY
      ) {
        return;
      }

      try {
        child.disconnect();
        child.unref();
      } catch (error) {
        stopWorker(error);
        return;
      }

      settled = true;
      if (timeout) clearTimeout(timeout);
      resolveStart();
    });
    timeout = setTimeout(
      () =>
        stopWorker(
          new Error(
            `close-worktree worker did not report readiness within ${deps.startupTimeoutMs}ms.`,
          ),
        ),
      deps.startupTimeoutMs,
    );
  });
}
