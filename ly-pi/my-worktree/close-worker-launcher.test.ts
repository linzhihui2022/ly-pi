import { describe, expect, it, vi } from "vitest";
import {
  type CloseWorktreeWorkerLauncherDeps,
  startCloseWorktreeWorker,
} from "./close-worker-launcher";
import { CLOSE_WORKTREE_WORKER_READY } from "./close-worker-protocol";
import type { WorktreeClosePlan } from "./closure";

const plan: WorktreeClosePlan = Object.freeze({
  repositoryRoot: "/repo",
  worktreePath: "/repo/.worktree/feature",
  branch: "feature",
  expectedSafetyState: Object.freeze({
    isCurrent: true,
    isLinked: true,
    isPrimary: false,
    isLocked: false,
    isPrunable: false,
    gitOperation: null,
    hasTrackedChanges: false,
    untrackedFiles: "none",
    hasInitializedSubmodules: false,
  }),
  hookArgv: Object.freeze([
    "wezterm",
    "cli",
    "kill-pane",
    "--pane-id",
    "pane-150",
  ]),
});

type Listener = (...args: unknown[]) => void;

function createChild() {
  const listeners = new Map<string, Listener>();
  let onKill: (() => void) | undefined;
  const child = {
    once: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
      return child;
    }),
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
      return child;
    }),
    disconnect: vi.fn(),
    pid: 123 as number | undefined,
    kill: vi.fn(() => {
      onKill?.();
      return true;
    }),
    unref: vi.fn(),
  };

  return {
    child,
    emit(event: "error" | "exit" | "message", ...args: unknown[]): void {
      listeners.get(event)?.(...args);
    },
    exitOnKill(
      code: number | null = null,
      signal: NodeJS.Signals | null = "SIGKILL",
    ): void {
      onKill = () => listeners.get("exit")?.(code, signal);
    },
  };
}

function launcherDeps(
  overrides: Partial<CloseWorktreeWorkerLauncherDeps> = {},
): CloseWorktreeWorkerLauncherDeps {
  return {
    spawn: () => {
      throw new Error("unexpected spawn");
    },
    exists: () => true,
    nodeExecutable: "/usr/local/bin/node",
    processId: 987,
    startupTimeoutMs: 5_000,
    workerPath: "/extension/close-worktree-worker.js",
    ...overrides,
  };
}

describe("startCloseWorktreeWorker", () => {
  it("starts a detached worker and waits for its readiness handshake", async () => {
    const { child, emit } = createChild();
    const spawn = vi.fn(() => child);
    const started = startCloseWorktreeWorker(plan, launcherDeps({ spawn }));

    expect(child.unref).not.toHaveBeenCalled();
    emit("message", CLOSE_WORKTREE_WORKER_READY);
    await expect(started).resolves.toBeUndefined();

    expect(spawn).toHaveBeenCalledWith(
      "/usr/local/bin/node",
      [
        "/extension/close-worktree-worker.js",
        JSON.stringify({ piPid: 987, plan }),
      ],
      {
        cwd: "/repo",
        detached: true,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      },
    );
    expect(child.disconnect).toHaveBeenCalledOnce();
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("waits for worker exit after an asynchronous startup failure", async () => {
    const { child, emit } = createChild();
    const started = startCloseWorktreeWorker(
      plan,
      launcherDeps({ spawn: vi.fn(() => child) }),
    );
    let rejected = false;
    void started.catch(() => {
      rejected = true;
    });

    emit("error", new Error("spawn denied"));
    await Promise.resolve();

    expect(rejected).toBe(false);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");

    emit("exit", null, "SIGKILL");
    await expect(started).rejects.toThrow("spawn denied");
    expect(child.disconnect).not.toHaveBeenCalled();
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("rejects an asynchronous spawn error when no worker process exists", async () => {
    const { child, emit } = createChild();
    child.pid = undefined;
    const started = startCloseWorktreeWorker(
      plan,
      launcherDeps({ spawn: vi.fn(() => child) }),
    );
    let rejected = false;
    void started.catch(() => {
      rejected = true;
    });

    emit("error", new Error("spawn denied"));
    await Promise.resolve();

    expect(rejected).toBe(true);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("rejects when the worker exits before reporting readiness", async () => {
    const { child, emit } = createChild();
    const started = startCloseWorktreeWorker(
      plan,
      launcherDeps({ spawn: vi.fn(() => child) }),
    );

    emit("exit", 1, null);

    await expect(started).rejects.toThrow(
      "close-worktree worker exited before reporting readiness (exit 1).",
    );
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("stops and waits for exit from a worker that never reports readiness", async () => {
    const { child, exitOnKill } = createChild();
    exitOnKill();
    const started = startCloseWorktreeWorker(
      plan,
      launcherDeps({
        spawn: vi.fn(() => child),
        startupTimeoutMs: 0,
      }),
    );

    await expect(started).rejects.toThrow(
      "close-worktree worker did not report readiness within 0ms.",
    );
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("ignores readiness that arrives after startup timeout begins termination", async () => {
    vi.useFakeTimers();
    try {
      const { child, emit } = createChild();
      const started = startCloseWorktreeWorker(
        plan,
        launcherDeps({
          spawn: vi.fn(() => child),
          startupTimeoutMs: 0,
        }),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");

      emit("message", CLOSE_WORKTREE_WORKER_READY);
      expect(child.disconnect).not.toHaveBeenCalled();
      expect(child.unref).not.toHaveBeenCalled();

      emit("exit", null, "SIGKILL");
      await expect(started).rejects.toThrow(
        "close-worktree worker did not report readiness within 0ms.",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a synchronous worker startup failure", async () => {
    await expect(
      startCloseWorktreeWorker(
        plan,
        launcherDeps({
          spawn: () => {
            throw new Error("invalid executable");
          },
        }),
      ),
    ).rejects.toThrow("invalid executable");
  });

  it("fails before spawn when the deployed worker asset is unavailable", async () => {
    const spawn = vi.fn();

    await expect(
      startCloseWorktreeWorker(
        plan,
        launcherDeps({ spawn, exists: () => false }),
      ),
    ).rejects.toThrow(
      "close-worktree worker is unavailable at /extension/close-worktree-worker.js",
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
