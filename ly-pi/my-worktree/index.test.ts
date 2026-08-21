import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./worktrees", () => ({
  getVisibleWorktrees: vi.fn(),
}));
vi.mock("./close-worker-runtime", () => ({
  executeWorkerCommand: vi.fn(),
  inspectCurrentWorktreeClosure: vi.fn(),
  isWorkerExecutable: vi.fn(),
}));
vi.mock("./close-worker-launcher", () => ({
  startCloseWorktreeWorker: vi.fn(),
}));

import { startCloseWorktreeWorker } from "./close-worker-launcher";
import { inspectCurrentWorktreeClosure } from "./close-worker-runtime";
import type { WorktreeClosureFacts } from "./closure";
import myWorktree from "./index";
import { getVisibleWorktrees } from "./worktrees";

type Handler = (event: unknown, ctx: any) => unknown;

function createTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
  };
}

function setup() {
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, { handler: Handler }>();
  const pi = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    registerCommand: vi.fn((name: string, command: { handler: Handler }) => {
      commands.set(name, command);
    }),
  };

  myWorktree(pi as never);
  return { handlers, commands, pi };
}

function createContext(cwd = "/repo/feature/src") {
  return {
    hasUI: true,
    mode: "tui",
    cwd,
    isIdle: vi.fn(() => true),
    shutdown: vi.fn(),
    ui: {
      confirm: vi.fn(),
      notify: vi.fn(),
      setWidget: vi.fn(),
    },
  };
}

function readyFacts(): WorktreeClosureFacts {
  return {
    platform: "darwin",
    worktree: {
      path: "/repo/.worktree/feature",
      repositoryRoot: "/repo",
      branch: "feature",
      isCurrent: true,
      isLinked: true,
      isPrimary: false,
      isLocked: false,
      isPrunable: false,
    },
    gitOperation: null,
    hasTrackedChanges: false,
    untrackedFiles: "none",
    hasInitializedSubmodules: false,
    closeHook: {
      command: "wezterm cli kill-pane --pane-id",
      target: "pane-150",
      executableAvailable: true,
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("my-worktree extension", () => {
  it("registers an above-editor widget and renders visible worktrees", async () => {
    vi.mocked(getVisibleWorktrees).mockResolvedValue({
      repositoryRoot: "/repo",
      worktrees: [
        { path: "/repo", label: "main", isCurrent: false },
        {
          path: "/repo/feature",
          label: "feature-x",
          isCurrent: true,
        },
      ],
    });
    const { handlers } = setup();
    const ctx = createContext();

    handlers.get("session_start")!({}, ctx);
    await flush();

    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-worktree",
      expect.any(Function),
      { placement: "aboveEditor" },
    );
    expect(getVisibleWorktrees).toHaveBeenCalledWith(ctx.cwd);

    const factory = ctx.ui.setWidget.mock.calls[0][1];
    const component = factory({ requestRender: vi.fn() }, createTheme());
    expect(component.render(120)).toEqual([
      "● Worktrees (2)",
      "├─ ○ main <REPO>",
      "└─ ● feature-x <REPO>/feature",
    ]);
  });

  it("renders nothing when fewer than two worktrees are visible", async () => {
    vi.mocked(getVisibleWorktrees).mockResolvedValue({
      repositoryRoot: "/repo/main",
      worktrees: [{ path: "/repo/main", label: "main", isCurrent: true }],
    });
    const { handlers } = setup();
    const ctx = createContext("/repo/main");

    handlers.get("session_start")!({}, ctx);
    await flush();

    const factory = ctx.ui.setWidget.mock.calls[0][1];
    const component = factory({ requestRender: vi.fn() }, createTheme());
    expect(component.render(120)).toEqual([]);
  });

  it("refreshes at the beginning and end of each turn", async () => {
    vi.mocked(getVisibleWorktrees).mockResolvedValue({
      repositoryRoot: "/repo",
      worktrees: [],
    });
    const { handlers } = setup();
    const ctx = createContext();

    handlers.get("session_start")!({}, ctx);
    await flush();
    handlers.get("turn_start")!({}, ctx);
    await flush();
    handlers.get("turn_end")!({}, ctx);
    await flush();

    expect(getVisibleWorktrees).toHaveBeenCalledTimes(3);
  });

  it("refreshes when a lifecycle event receives a new context object", async () => {
    vi.mocked(getVisibleWorktrees).mockResolvedValue({
      repositoryRoot: "/repo",
      worktrees: [],
    });
    const { handlers } = setup();
    const sessionContext = createContext("/repo/main");
    const turnContext = createContext("/repo/feature");

    handlers.get("session_start")!({}, sessionContext);
    await flush();
    handlers.get("turn_start")!({}, turnContext);
    await flush();

    expect(getVisibleWorktrees).toHaveBeenNthCalledWith(1, "/repo/main");
    expect(getVisibleWorktrees).toHaveBeenNthCalledWith(2, "/repo/feature");
  });

  it("does not install a widget without a UI", () => {
    const { handlers } = setup();
    const ctx = { ...createContext(), hasUI: false };

    handlers.get("session_start")!({}, ctx);

    expect(ctx.ui.setWidget).not.toHaveBeenCalled();
    expect(getVisibleWorktrees).not.toHaveBeenCalled();
  });

  it("rejects close-worktree arguments, non-TUI calls, and busy Pi before preflight", async () => {
    const { commands } = setup();
    const handler = commands.get("close-worktree")!.handler;
    const argumentContext = createContext();
    const nonTuiContext = { ...createContext(), mode: "rpc" };
    const busyContext = { ...createContext(), isIdle: vi.fn(() => false) };

    await handler("unexpected", argumentContext);
    await handler("", nonTuiContext);
    await handler("", busyContext);

    expect(inspectCurrentWorktreeClosure).not.toHaveBeenCalled();
    expect(startCloseWorktreeWorker).not.toHaveBeenCalled();
    expect(argumentContext.shutdown).not.toHaveBeenCalled();
    expect(nonTuiContext.shutdown).not.toHaveBeenCalled();
    expect(busyContext.shutdown).not.toHaveBeenCalled();
    expect(argumentContext.ui.notify).toHaveBeenCalledWith(
      "/close-worktree does not accept arguments.",
      "error",
    );
    expect(nonTuiContext.ui.notify).toHaveBeenCalledWith(
      "/close-worktree is available only in an interactive Pi TUI session.",
      "error",
    );
    expect(busyContext.ui.notify).toHaveBeenCalledWith(
      "/close-worktree is available only while Pi is idle.",
      "error",
    );
  });

  it("refuses an ineligible worktree without confirmation or shutdown", async () => {
    vi.mocked(inspectCurrentWorktreeClosure).mockResolvedValue({
      ...readyFacts(),
      platform: "linux",
    });
    const { commands } = setup();
    const ctx = createContext();

    await commands.get("close-worktree")!.handler("", ctx);

    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(startCloseWorktreeWorker).not.toHaveBeenCalled();
    expect(ctx.shutdown).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "/close-worktree is available only on macOS.",
      "error",
    );
  });

  it("shows the closure summary and leaves everything untouched on cancellation", async () => {
    vi.mocked(inspectCurrentWorktreeClosure).mockResolvedValue(readyFacts());
    vi.mocked(startCloseWorktreeWorker).mockResolvedValue(undefined);
    const { commands } = setup();
    const ctx = createContext();
    ctx.ui.confirm.mockResolvedValue(false);

    await commands.get("close-worktree")!.handler("", ctx);

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Close current worktree?",
      expect.stringContaining("/repo/.worktree/feature"),
    );
    const summary = ctx.ui.confirm.mock.calls[0][1] as string;
    expect(summary).toContain("Local branch retained: feature");
    expect(summary).toContain("Ignored files in this worktree may be deleted.");
    expect(summary).toContain("No external-process scan was performed.");
    expect(summary).toContain("only after successful removal");
    expect(startCloseWorktreeWorker).not.toHaveBeenCalled();
    expect(ctx.shutdown).not.toHaveBeenCalled();
  });

  it("keeps Pi running when the detached worker cannot start", async () => {
    vi.mocked(inspectCurrentWorktreeClosure).mockResolvedValue(readyFacts());
    vi.mocked(startCloseWorktreeWorker).mockRejectedValue(
      new Error("worker unavailable"),
    );
    const { commands } = setup();
    const ctx = createContext();
    ctx.ui.confirm.mockResolvedValue(true);

    await commands.get("close-worktree")!.handler("", ctx);

    expect(startCloseWorktreeWorker).toHaveBeenCalledOnce();
    expect(ctx.shutdown).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Could not start close-worktree worker: worker unavailable. Pi remains running.",
      "error",
    );
  });

  it("starts the worker before requesting graceful shutdown", async () => {
    vi.mocked(inspectCurrentWorktreeClosure).mockResolvedValue(readyFacts());
    const calls: string[] = [];
    vi.mocked(startCloseWorktreeWorker).mockImplementation(async () => {
      calls.push("worker");
    });
    const { commands } = setup();
    const ctx = createContext();
    ctx.ui.confirm.mockResolvedValue(true);
    ctx.shutdown.mockImplementation(() => {
      calls.push("shutdown");
    });

    await commands.get("close-worktree")!.handler("", ctx);

    expect(startCloseWorktreeWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: "/repo",
        worktreePath: "/repo/.worktree/feature",
        branch: "feature",
        hookArgv: ["wezterm", "cli", "kill-pane", "--pane-id", "pane-150"],
      }),
    );
    expect(calls).toEqual(["worker", "shutdown"]);
  });
});
