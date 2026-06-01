import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (text: string, _width: number) => text,
}));

// ── Mocks ──

const registeredEvents = new Map<string, (...args: any[]) => any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
};

const mockTui = { requestRender: vi.fn() };
const mockTheme = {
  fg: vi.fn((_c: string, text: string) => text),
};

const mockFooterData = {
  onBranchChange: vi.fn((cb: () => void) => {
    cb();
    return vi.fn();
  }),
  getGitBranch: vi.fn(() => "main"),
  getAvailableProviderCount: vi.fn(() => 3),
};

const mockCtx = {
  cwd: "/home/user/project",
  model: { id: "gpt-4" },
  sessionManager: { getEntries: vi.fn(() => []) },
  getContextUsage: vi.fn(() => ({ percent: 42 })),
  ui: {
    setFooter: vi.fn((factory: any) => {
      return factory(mockTui, mockTheme, mockFooterData);
    }),
  },
};

async function loadModule() {
  return await import("./index");
}

// ── Tests ──

describe("formatTokens", () => {
  it("returns raw count for < 1000", async () => {
    const { formatTokens } = await loadModule();
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("returns decimal k for 1000-9999", async () => {
    const { formatTokens } = await loadModule();
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9999)).toBe("10.0k");
  });

  it("returns integer k for 10000-999999", async () => {
    const { formatTokens } = await loadModule();
    expect(formatTokens(10000)).toBe("10k");
    expect(formatTokens(999999)).toBe("1000k");
  });

  it("returns decimal M for 1M-9.9M", async () => {
    const { formatTokens } = await loadModule();
    expect(formatTokens(1000000)).toBe("1.0M");
    expect(formatTokens(9900000)).toBe("9.9M");
  });

  it("returns integer M for >= 10M", async () => {
    const { formatTokens } = await loadModule();
    expect(formatTokens(10000000)).toBe("10M");
    expect(formatTokens(25000000)).toBe("25M");
  });
});

describe("contextColored", () => {
  it("returns dim '--' for null", async () => {
    const { contextColored } = await loadModule();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    expect(contextColored(theme, null)).toBe("--");
    expect(theme.fg).toHaveBeenCalledWith("dim", "--");
  });

  it("returns dim for <= 70%", async () => {
    const { contextColored } = await loadModule();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    expect(contextColored(theme, 0)).toBe("0%");
    expect(contextColored(theme, 70)).toBe("70%");
    expect(theme.fg).toHaveBeenCalledWith("dim", "70%");
  });

  it("returns warning for 71-90%", async () => {
    const { contextColored } = await loadModule();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    expect(contextColored(theme, 71)).toBe("71%");
    expect(contextColored(theme, 90)).toBe("90%");
    expect(theme.fg).toHaveBeenCalledWith("warning", "90%");
  });

  it("returns error for > 90%", async () => {
    const { contextColored } = await loadModule();
    const theme = { fg: vi.fn((_c: string, text: string) => text) };
    expect(contextColored(theme, 91)).toBe("91%");
    expect(contextColored(theme, 100)).toBe("100%");
    expect(theme.fg).toHaveBeenCalledWith("error", "100%");
  });
});

describe("my-hud extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    vi.clearAllMocks();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers turn_end handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("turn_end")).toBe(true);
  });

  it("registers model_select handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("model_select")).toBe(true);
  });

  it("registers session_start handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("session_start")).toBe(true);
  });

  it("turn_end handler triggers requestRender when currentTui is set", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const turnEndHandler = registeredEvents.get("turn_end")!;
    turnEndHandler();
    expect(mockTui.requestRender).not.toHaveBeenCalled();

    // Simulate session_start to set currentTui
    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    mockTui.requestRender.mockClear();
    turnEndHandler();
    expect(mockTui.requestRender).toHaveBeenCalled();
  });

  it("model_select handler no-ops when currentTui is null", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const modelSelectHandler = registeredEvents.get("model_select")!;
    modelSelectHandler();
    expect(mockTui.requestRender).not.toHaveBeenCalled();
  });

  it("model_select handler triggers requestRender when currentTui is set", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    const modelSelectHandler = registeredEvents.get("model_select")!;
    mockTui.requestRender.mockClear();
    modelSelectHandler();
    expect(mockTui.requestRender).toHaveBeenCalled();
  });

  it("session_start installs footer via setFooter", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    expect(mockCtx.ui.setFooter).toHaveBeenCalled();
  });

  it("footer render returns two lines", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    const component = mockCtx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("project");
    expect(lines[1]).toContain("/home/user/project");
  });

  it("render aggregates tokens from assistant messages", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const entries = [
      { type: "other" },
      { type: "message", message: { role: "user" } },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: {
            input: 1500,
            output: 800,
            cacheRead: 100,
            cacheWrite: 50,
            cost: { total: 0.005 },
          },
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: {
            input: 2500,
            output: 1200,
            cacheRead: 200,
            cacheWrite: 100,
            cost: { total: 0.007 },
          },
        },
      },
    ];

    const ctx = {
      ...mockCtx,
      sessionManager: { getEntries: vi.fn(() => entries) },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines[0]).toContain("↑4.0k");
    expect(lines[0]).toContain("↓2.0k");
    expect(lines[0]).toContain("$0.012");
  });

  it("render uses singular provider when count is 1", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const footerDataOneProvider = {
      ...mockFooterData,
      getAvailableProviderCount: vi.fn(() => 1),
    };

    const ctx = {
      ...mockCtx,
      ui: {
        setFooter: vi.fn((factory: any) => {
          return factory(mockTui, mockTheme, footerDataOneProvider);
        }),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);
    expect(lines[1]).toContain("1 provider");
    expect(lines[1]).not.toContain("providers");
  });

  it("render omits branch when getGitBranch returns null", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const footerDataNoBranch = {
      ...mockFooterData,
      getGitBranch: vi.fn(() => null),
    };

    const ctx = {
      ...mockCtx,
      ui: {
        setFooter: vi.fn((factory: any) => {
          return factory(mockTui, mockTheme, footerDataNoBranch);
        }),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);
    expect(lines[0]).toContain("gpt-4");
    expect(lines[0]).not.toContain("(null)");
  });

  it("render shows 'no-model' when ctx.model is undefined", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      model: undefined,
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);
    expect(lines[0]).toContain("no-model");
  });

  it("render shows '--' when context usage percent is null", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      getContextUsage: vi.fn(() => ({ percent: null })),
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);
    expect(lines[0]).toContain("--");
  });

  it("dispose cleans up branch subscription and currentTui", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    const component = mockCtx.ui.setFooter.mock.results[0].value;
    const unsubBranch = mockFooterData.onBranchChange.mock.results[0].value;

    component.dispose();

    expect(unsubBranch).toHaveBeenCalled();
    // After dispose, turn_end handler should no-op
    const turnEndHandler = registeredEvents.get("turn_end")!;
    mockTui.requestRender.mockClear();
    turnEndHandler();
    expect(mockTui.requestRender).not.toHaveBeenCalled();
  });

  it("invalidate is a no-op", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    const component = mockCtx.ui.setFooter.mock.results[0].value;
    expect(() => component.invalidate()).not.toThrow();
  });
});
