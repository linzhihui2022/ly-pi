import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./worktrees", () => ({
  getVisibleWorktrees: vi.fn(),
}));

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
  const pi = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
  };

  myWorktree(pi as never);
  return { handlers, pi };
}

function createContext(cwd = "/repo/feature/src") {
  return {
    hasUI: true,
    cwd,
    ui: { setWidget: vi.fn() },
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
});
