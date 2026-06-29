import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGitStatus } from "./git";
import { checkMemoryPressure } from "./memory";
import { findVitestProcesses } from "./vitest-process";

vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (text: string, _width: number) => text,
}));

vi.mock("./git", () => ({
  getGitStatus: vi.fn(() =>
    Promise.resolve({
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: true,
    }),
  ),
}));

vi.mock("./memory", () => ({
  checkMemoryPressure: vi.fn(),
}));

vi.mock("./vitest-process", () => ({
  findVitestProcesses: vi.fn(),
}));

// ── Mocks ──

const registeredEvents = new Map<string, (...args: any[]) => any>();

const registeredCommands = new Map<string, any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerCommand: vi.fn((name: string, config: any) => {
    registeredCommands.set(name, config);
  }),
};

const mockTui = { requestRender: vi.fn() };
const mockTheme = {
  fg: vi.fn((_c: string, text: string) => text),
  bg: vi.fn((_c: string, text: string) => text),
  bold: vi.fn((text: string) => text),
  italic: vi.fn((text: string) => text),
  underline: vi.fn((text: string) => text),
  inverse: vi.fn((text: string) => text),
  strikethrough: vi.fn((text: string) => text),
  getFgAnsi: vi.fn(() => ""),
  getBgAnsi: vi.fn(() => ""),
  getColorMode: vi.fn(() => "truecolor"),
  getThinkingBorderColor: vi.fn(() => (str: string) => str),
  getBashModeBorderColor: vi.fn(() => (str: string) => str),
} as any;

function createMockTheme(): any {
  return {
    fg: vi.fn((_c: string, text: string) => text),
    bg: vi.fn((_c: string, text: string) => text),
    bold: vi.fn((text: string) => text),
    italic: vi.fn((text: string) => text),
    underline: vi.fn((text: string) => text),
    inverse: vi.fn((text: string) => text),
    strikethrough: vi.fn((text: string) => text),
    getFgAnsi: vi.fn(() => ""),
    getBgAnsi: vi.fn(() => ""),
    getColorMode: vi.fn(() => "truecolor"),
    getThinkingBorderColor: vi.fn(() => (str: string) => str),
    getBashModeBorderColor: vi.fn(() => (str: string) => str),
  };
}

const mockFooterData = {
  onBranchChange: vi.fn((cb: () => void) => {
    cb();
    return vi.fn();
  }),
  getGitBranch: vi.fn(() => "main"),
};

const mockCtx = {
  hasUI: true,
  cwd: "/home/user/project",
  model: { id: "gpt-4" },
  sessionManager: { getEntries: vi.fn(() => []) },
  getContextUsage: vi.fn(() => ({ percent: 42, contextWindow: 128000 })),
  ui: {
    setFooter: vi.fn((factory: any) => {
      return factory(mockTui, mockTheme, mockFooterData);
    }),
    setWidget: vi.fn(),
    getTheme: vi.fn(() => mockTheme),
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

describe("shortModelName", () => {
  it("returns short name for known models", async () => {
    const { shortModelName } = await loadModule();
    expect(shortModelName("kimi-k2-thinking")).toBe("k-tkg");
    expect(shortModelName("kimi-for-coding")).toBe("k-cdg");
    expect(shortModelName("deepseek-v4-flash")).toBe("ds-fls");
    expect(shortModelName("deepseek-v4-pro")).toBe("ds-pro");
  });

  it("returns original name for unknown models", async () => {
    const { shortModelName } = await loadModule();
    expect(shortModelName("gpt-4")).toBe("gpt-4");
    expect(shortModelName("claude-3")).toBe("claude-3");
  });
});

describe("contextColored", () => {
  it("returns dim '--' for null percent", async () => {
    const { contextColored } = await loadModule();
    const theme = createMockTheme();
    expect(contextColored(theme, null, 128000)).toBe("--");
    expect(theme.fg).toHaveBeenCalledWith("dim", "--");
  });

  it("treats contextWindow 0 as small window", async () => {
    const { contextColored } = await loadModule();
    const theme = createMockTheme();
    expect(contextColored(theme, 50, 0)).toContain("50%");
    expect(theme.fg).toHaveBeenCalledWith(
      "accent",
      expect.stringContaining("50%"),
    );
  });

  describe("small context window (<= 500k)", () => {
    it("returns accent for 0-70%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 0, 128000)).toContain("0%");
      expect(contextColored(theme, 70, 128000)).toContain("70%");
      expect(theme.fg).toHaveBeenCalledWith(
        "accent",
        expect.stringContaining("70%"),
      );
    });

    it("returns warning for 71-90%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 71, 128000)).toContain("71%");
      expect(contextColored(theme, 90, 128000)).toContain("90%");
      expect(theme.fg).toHaveBeenCalledWith(
        "warning",
        expect.stringContaining("90%"),
      );
    });

    it("returns error for > 90%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 91, 128000)).toContain("91%");
      expect(contextColored(theme, 100, 128000)).toContain("100%");
      expect(theme.fg).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("100%"),
      );
    });
  });

  describe("large context window (> 500k)", () => {
    it("returns accent for 0-20%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 0, 600000)).toContain("0%");
      expect(contextColored(theme, 20, 600000)).toContain("20%");
      expect(theme.fg).toHaveBeenCalledWith(
        "accent",
        expect.stringContaining("20%"),
      );
    });

    it("returns warning for 21-50%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 21, 600000)).toContain("21%");
      expect(contextColored(theme, 50, 600000)).toContain("50%");
      expect(theme.fg).toHaveBeenCalledWith(
        "warning",
        expect.stringContaining("50%"),
      );
    });

    it("returns error for > 50%", async () => {
      const { contextColored } = await loadModule();
      const theme = createMockTheme();
      expect(contextColored(theme, 51, 600000)).toContain("51%");
      expect(theme.fg).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("51%"),
      );
    });
  });
});

describe("formatCacheRate", () => {
  it("returns 0% when both values are zero", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(0, 0)).toBe("0%");
  });

  it("returns 0% when cacheRead is zero but input is non-zero", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 0)).toBe("0%");
  });

  it("returns 50% when cacheRead equals input", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 100)).toBe("50%");
  });

  it("returns 80% when cacheRead is 4x input", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(100, 400)).toBe("80%");
  });

  it("rounds to nearest integer", async () => {
    const { formatCacheRate } = await loadModule();
    expect(formatCacheRate(3, 1)).toBe("25%");
    expect(formatCacheRate(2, 1)).toBe("33%");
  });
});

describe("aggregateSessionUsage", () => {
  it("returns zeros for empty entries", async () => {
    const { aggregateSessionUsage } = await loadModule();
    expect(aggregateSessionUsage([])).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
  });

  it("ignores non-assistant messages", async () => {
    const { aggregateSessionUsage } = await loadModule();
    const entries = [
      { type: "other" },
      {
        type: "message",
        message: {
          role: "user",
          usage: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 5,
            cost: { total: 0.01 },
          },
        },
      },
    ];
    expect(aggregateSessionUsage(entries as any)).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
  });

  it("ignores entries with undefined message", async () => {
    const { aggregateSessionUsage } = await loadModule();
    const entries = [
      { type: "message", message: undefined },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 5,
            cost: { total: 0.01 },
          },
        },
      },
    ];
    expect(aggregateSessionUsage(entries as any)).toEqual({
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      cost: 0.07,
    });
  });

  it("sums assistant message usage and converts cost to CNY", async () => {
    const { aggregateSessionUsage } = await loadModule();
    const entries = [
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
    expect(aggregateSessionUsage(entries as any)).toEqual({
      input: 4000,
      output: 2000,
      cacheRead: 300,
      cacheWrite: 150,
      cost: 0.084, // (0.005 + 0.007) * 7
    });
  });
});

describe("getLastUserMessage", () => {
  it("returns null for empty entries", async () => {
    const { getLastUserMessage } = await loadModule();
    expect(getLastUserMessage([])).toBeNull();
  });

  it("returns null when no user messages", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      { type: "message", message: { role: "assistant", content: "hello" } },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("returns string content from last user message", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      { type: "message", message: { role: "user", content: "first" } },
      { type: "message", message: { role: "user", content: "second" } },
    ];
    expect(getLastUserMessage(entries as any)).toBe("second");
  });

  it("skips empty or whitespace-only messages", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      { type: "message", message: { role: "user", content: "   " } },
      { type: "message", message: { role: "user", content: "valid" } },
    ];
    expect(getLastUserMessage(entries as any)).toBe("valid");
  });

  it("joins array content parts", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("hello world");
  });

  it("marks non-text parts as [MEDIA]", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: "look at" },
            { type: "image", url: "http://x" },
          ],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("look at [MEDIA]");
  });

  it("searches from the end of entries", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      { type: "message", message: { role: "user", content: "oldest" } },
      { type: "message", message: { role: "assistant", content: "reply" } },
      { type: "message", message: { role: "user", content: "newest" } },
    ];
    expect(getLastUserMessage(entries as any)).toBe("newest");
  });

  it("returns null when entries have non-message types", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      { type: "other" },
      { type: "tool_call", message: { role: "user", content: "test" } },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("returns null when user message content is an empty array", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("skips user messages with null content", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: null,
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("skips entries with undefined message", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [{ type: "message", message: undefined }];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("strips skill XML tags from string content", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: '<skill name="test">skill body</skill>\nactual message',
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("actual message");
  });

  it("strips multiline skill XML tags", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content:
            '<skill name="x" location="/path">\n  <rule>abc</rule>\n</skill>\nuser text',
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("user text");
  });

  it("returns null when only skill tags are present", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: '<skill name="x">body</skill>',
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });

  it("strips skill XML tags from array content parts", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: '<skill name="x">body</skill>\n' },
            { type: "text", text: "hello" },
          ],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("hello");
  });

  it("handles array with raw string parts and skill tags", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: ['<skill name="x">body</skill>', " raw string"],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("raw string");
  });

  it("handles array with [MEDIA] and skill tags", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "image", url: "http://x" },
            { type: "text", text: '<skill name="x">body</skill>' },
            { type: "text", text: "after media" },
          ],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBe("[MEDIA]  after media");
  });

  it("returns null when array only contains skill tags", async () => {
    const { getLastUserMessage } = await loadModule();
    const entries = [
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: '<skill name="x">body</skill>' }],
        },
      },
    ];
    expect(getLastUserMessage(entries as any)).toBeNull();
  });
});

describe("formatGitStatus", () => {
  const mockTheme = { fg: vi.fn((_c: string, text: string) => text) };

  it("returns empty for null status", async () => {
    const { formatGitStatus } = await loadModule();
    expect(formatGitStatus(createMockTheme(), null)).toBe("");
  });

  it("returns empty for clean status", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: true,
    };
    expect(formatGitStatus(createMockTheme(), status)).toBe("");
  });

  it("formats ahead only", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 2,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toBe("⇡2");
  });

  it("formats behind only", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 3,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("⇣3");
  });

  it("formats diverged", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 3,
      behind: 2,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("⇕⇡3⇣2");
  });

  it("formats staged", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 3,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("++3|");
  });

  it("formats stashed", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 1,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("*1|");
  });

  it("formats conflicted", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      stashed: 0,
      conflicted: 2,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("!!2|");
  });

  it("formats unstaged", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 3,
      untracked: 0,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("~3|");
  });

  it("formats untracked", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 2,
      stashed: 0,
      conflicted: 0,
      isClean: false,
    };
    expect(formatGitStatus(createMockTheme(), status)).toContain("?2|");
  });

  it("combines multiple statuses", async () => {
    const { formatGitStatus } = await loadModule();
    const status = {
      ahead: 1,
      behind: 0,
      staged: 2,
      unstaged: 0,
      untracked: 0,
      stashed: 1,
      conflicted: 0,
      isClean: false,
    };
    const result = formatGitStatus(createMockTheme(), status);
    expect(result).toContain("++2|");
    expect(result).toContain("*1|");
    expect(result).toContain("⇡1");
  });
});

describe("buildStatusLine", () => {
  it("builds a line with all parts when branch is present", async () => {
    const { buildStatusLine } = await loadModule();
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      project: "my-project",
      modelName: "gpt-4",
      branch: "main",
      ctxColored: "42%",
      usage: {
        input: 1000,
        output: 500,
        cacheRead: 100,
        cacheWrite: 0,
        cost: 0.35,
      },
    });
    expect(line).toContain("my-project");
    expect(line).toContain("gpt-4");
    expect(line).toContain("main");
    expect(line).toContain("42%");
    expect(line).toContain("1.0k");
    expect(line).toContain("500");
    expect(line).toContain("100");
    expect(line).toContain("0.35");
    expect(line).toContain("9%"); // cacheRead=100 / (100+1000) ≈ 9%
  });

  it("omits branch when null", async () => {
    const { buildStatusLine } = await loadModule();
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      project: "x",
      modelName: "y",
      branch: null,
      ctxColored: "--",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    });
    expect(line).not.toContain("main");
    expect(line).toContain("x");
  });

  it("truncates long project names", async () => {
    const { buildStatusLine } = await loadModule();
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      project: "very-long-project-name",
      modelName: "m",
      branch: null,
      ctxColored: "--",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    });
    expect(line).toContain("very-lon..");
  });

  it("appends git status when branch is present and status is not clean", async () => {
    const { buildStatusLine } = await loadModule();
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      project: "my-project",
      modelName: "gpt-4",
      branch: "main",
      ctxColored: "42%",
      usage: {
        input: 1000,
        output: 500,
        cacheRead: 100,
        cacheWrite: 0,
        cost: 0.35,
      },
      gitStatus: {
        ahead: 2,
        behind: 0,
        staged: 3,
        unstaged: 0,
        untracked: 0,
        stashed: 1,
        conflicted: 0,
        isClean: false,
      },
    });
    expect(line).toContain("main");
    expect(line).toContain("⇡2");
    expect(line).toContain("++3|");
    expect(line).toContain("*1|");
  });
});

describe("Bar", () => {
  it("registers widget on update", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const uiCtx = { setWidget } as any;

    bar.setUICtx(uiCtx);
    bar.update();

    expect(setWidget).toHaveBeenCalledWith("my-hud-bar", expect.any(Function), {
      placement: "aboveEditor",
    });
  });

  it("updates branch and renders it", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const mockEntries: any[] = [];
    const ctx = {
      cwd: "/home/user/my-project",
      model: { id: "gpt-4" },
      sessionManager: { getEntries: () => mockEntries },
      getContextUsage: () => ({ percent: 10, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    const lines = component.render(200);

    expect(lines[0]).toContain("my-project");
    expect(lines[0]).toContain("feature-x");
  });

  it("calls dispose on uiCtx", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    bar.setUICtx({ setWidget } as any);
    bar.dispose();

    expect(setWidget).toHaveBeenCalledWith("my-hud-bar", undefined);
  });

  it("invalidate callback clears tui", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    component.render(100); // capture tui
    component.invalidate();

    // After invalidate, requestRender should no-op
    expect(() => bar.requestRender()).not.toThrow();
  });

  it("requestRender forwards to tui", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);
    component.render(100); // ensure tui is captured
    bar.requestRender();

    expect(requestRender).toHaveBeenCalled();
  });

  it("requestRender no-ops when tui is not set", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    // tui is never captured because update() was not called
    expect(() => bar.requestRender()).not.toThrow();
  });

  it("setUICtx does not reset tui when ctx is unchanged", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const uiCtx = { setWidget } as any;

    bar.setUICtx(uiCtx);
    bar.setUICtx(uiCtx);
    // setWidget should only be called once per update()
    bar.update();
    expect(setWidget).toHaveBeenCalledTimes(1);
  });

  it("dispose no-ops when uiCtx is not set", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    expect(() => bar.dispose()).not.toThrow();
  });

  it("update no-ops when uiCtx is not set", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    expect(() => bar.update()).not.toThrow();
  });

  it("renderWidget returns empty array when ctx is not set", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();

    bar.setUICtx({ setWidget } as any);
    // ctx is not set
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    const lines = component.render(100);

    expect(lines).toEqual([]);
  });

  it("renderWidget handles undefined context usage", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => undefined,
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    const lines = component.render(100);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("--");
  });

  it("renderWidget uses 'no-model' when model is undefined", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: undefined,
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    const lines = component.render(100);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no-model");
  });

  it("triggers async git status refresh on first render", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render triggers async refresh
    component.render(100);
    expect(requestRender).not.toHaveBeenCalled();

    // Wait for async refresh
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("uses cached git status on subsequent renders within TTL", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render triggers async fetch
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));

    // Second render within TTL should not trigger another fetch
    requestRender.mockClear();
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("invalidateGitStatus clears cache and triggers refresh on next render", async () => {
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    requestRender.mockClear();

    // Invalidate and render again
    bar.invalidateGitStatus();
    component.render(100);
    await new Promise((r) => setTimeout(r, 50));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("handles git status fetch failure gracefully", async () => {
    vi.mocked(getGitStatus).mockRejectedValueOnce(new Error("git failed"));
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // Should not throw even when getGitStatus rejects
    expect(() => component.render(100)).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("does not trigger duplicate fetches while one is pending", async () => {
    vi.mocked(getGitStatus).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ahead: 1,
                behind: 0,
                staged: 0,
                unstaged: 0,
                untracked: 0,
                stashed: 0,
                conflicted: 0,
                isClean: false,
              }),
            100,
          ),
        ),
    );
    const { Bar } = await loadModule();
    const bar = new Bar();
    const setWidget = vi.fn();
    const requestRender = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      cwd: "/x",
      model: { id: "m" },
      sessionManager: { getEntries: () => [] },
      getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
    };

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory({ requestRender }, theme);

    // First render starts async fetch
    component.render(100);
    // Second render while pending should not start another fetch
    component.render(100);
    expect(requestRender).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 150));
    // Only one requestRender after the single fetch completes
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});

describe("working", () => {
  it("has a non-empty list of messages", async () => {
    const { WORKING_MESSAGES } = await loadModule();
    expect(WORKING_MESSAGES.length).toBeGreaterThan(0);
    WORKING_MESSAGES.forEach((msg) => {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  it("pickRandomMessage returns a string from the list", async () => {
    const { pickRandomMessage, WORKING_MESSAGES } = await loadModule();
    const result = pickRandomMessage();
    expect(WORKING_MESSAGES).toContain(result);
  });

  it("pickRandomMessage can return different messages across calls", async () => {
    const { pickRandomMessage } = await loadModule();
    // Call many times; with 12 messages this statistically covers >1
    const results = new Set(
      Array.from({ length: 100 }, () => pickRandomMessage()),
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("my-hud extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    registeredCommands.clear();
    vi.clearAllMocks();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers turn_start handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("turn_start")).toBe(true);
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

  it("session_start skips widget and footer when hasUI is false", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    const ctxNoUI = { ...mockCtx, hasUI: false };
    sessionStartHandler({}, ctxNoUI);

    expect(ctxNoUI.ui.setWidget).not.toHaveBeenCalled();
    expect(ctxNoUI.ui.setFooter).not.toHaveBeenCalled();
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
    sessionStartHandler({}, { ...mockCtx, hasUI: true });

    const modelSelectHandler = registeredEvents.get("model_select")!;
    mockTui.requestRender.mockClear();
    modelSelectHandler();
    expect(mockTui.requestRender).toHaveBeenCalled();
  });

  it("session_start installs footer via setFooter", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, { ...mockCtx, hasUI: true });

    expect(mockCtx.ui.setFooter).toHaveBeenCalled();
  });

  it("footer render shows last user message", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      hasUI: true,
      sessionManager: {
        getEntries: vi.fn(() => [
          {
            type: "message",
            message: { role: "user", content: "hello world" },
          },
        ]),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("hello world");
  });

  it("footer render truncates multi-line message to first line only", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      hasUI: true,
      sessionManager: {
        getEntries: vi.fn(() => [
          {
            type: "message",
            message: {
              role: "user",
              content: "first line\nsecond line\nthird",
            },
          },
        ]),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("first line");
    expect(lines[0]).not.toContain("second line");
  });

  it("footer render returns empty array when no user message", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, mockCtx);

    const component = mockCtx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines).toHaveLength(0);
  });

  it("footer render handles user message with array content", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      hasUI: true,
      sessionManager: {
        getEntries: vi.fn(() => [
          {
            type: "message",
            message: {
              role: "user",
              content: [
                { type: "text", text: "first" },
                { type: "text", text: "second" },
              ],
            },
          },
        ]),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines[0]).toContain("first second");
  });

  it("dispose cleans up branch subscription, currentTui and bar", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, { ...mockCtx, hasUI: true });

    const component = mockCtx.ui.setFooter.mock.results[0].value;
    const unsubBranch = mockFooterData.onBranchChange.mock.results[0].value;

    component.dispose();

    expect(unsubBranch).toHaveBeenCalled();
    // After dispose, requestRender should no-op for currentTui
    mockTui.requestRender.mockClear();
    // model_select handler still exists and can be called safely
    const modelSelectHandler = registeredEvents.get("model_select")!;
    modelSelectHandler();
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

  it("render returns error line when an exception is thrown", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const ctx = {
      ...mockCtx,
      hasUI: true,
      sessionManager: {
        getEntries: vi.fn(() => {
          throw new Error("boom");
        }),
      },
    };

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, ctx);

    const component = ctx.ui.setFooter.mock.results[0].value;
    const lines = component.render(120);

    expect(lines[0]).toContain("[my-hud error]");
    expect(lines[0]).toContain("boom");
  });

  it("turn_start handler sets working message with theme and triggers render", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const turnStartHandler = registeredEvents.get("turn_start")!;
    const setWorkingMessage = vi.fn();
    const theme = createMockTheme();
    const ctx = { ui: { setWorkingMessage, getTheme: vi.fn(() => theme) } };

    turnStartHandler({}, ctx);

    expect(ctx.ui.getTheme).toHaveBeenCalledWith("catppuccin-mocha");
    expect(setWorkingMessage).toHaveBeenCalledWith(expect.any(String));
  });

  it("turn_start handler falls back to plain message when theme is undefined", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const turnStartHandler = registeredEvents.get("turn_start")!;
    const setWorkingMessage = vi.fn();
    const ctx = { ui: { setWorkingMessage, getTheme: vi.fn(() => undefined) } };

    turnStartHandler({}, ctx);

    expect(setWorkingMessage).toHaveBeenCalledWith(expect.any(String));
  });

  it("turn_start handler triggers requestRender when currentTui is set", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, { ...mockCtx, hasUI: true });

    const turnStartHandler = registeredEvents.get("turn_start")!;
    mockTui.requestRender.mockClear();
    const theme = createMockTheme();
    turnStartHandler(
      {},
      { ui: { setWorkingMessage: vi.fn(), getTheme: vi.fn(() => theme) } },
    );

    expect(mockTui.requestRender).toHaveBeenCalled();
  });

  it("turn_start handler no-ops when setWorkingMessage throws", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const turnStartHandler = registeredEvents.get("turn_start")!;
    const setWorkingMessage = vi.fn(() => {
      throw new Error("ui fail");
    });
    const theme = createMockTheme();
    const ctx = { ui: { setWorkingMessage, getTheme: vi.fn(() => theme) } };

    expect(() => turnStartHandler({}, ctx)).toThrow("ui fail");
  });

  it("turn_end handler triggers requestRender when currentTui is set", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const sessionStartHandler = registeredEvents.get("session_start")!;
    sessionStartHandler({}, { ...mockCtx, hasUI: true });

    const turnEndHandler = registeredEvents.get("turn_end")!;
    mockTui.requestRender.mockClear();
    turnEndHandler();

    expect(mockTui.requestRender).toHaveBeenCalled();
  });

  it("registers /mem command", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredCommands.has("mem")).toBe(true);
  });

  it("/mem command notifies with memory status", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 42, ok: true });

    const mod = await loadModule();
    mod.default(mockPi as any);

    const notify = vi.fn();
    const ctx = { ui: { notify } };
    const command = registeredCommands.get("mem")!;
    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith("内存使用: 42%", "info");
  });

  it("/mem command warns when memory is high", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 87, ok: false });

    const mod = await loadModule();
    mod.default(mockPi as any);

    const notify = vi.fn();
    const ctx = { ui: { notify } };
    const command = registeredCommands.get("mem")!;
    await command.handler("", ctx);

    expect(notify).toHaveBeenCalledWith("内存使用: 87%", "warning");
  });

  it("registers agent_start handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_start")).toBe(true);
  });

  it("registers agent_end handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(registeredEvents.has("agent_end")).toBe(true);
  });

  it("agent_start hides memory warning widget when memory is ok", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 42, ok: true });
    vi.mocked(findVitestProcesses).mockReturnValue([]);

    const mod = await loadModule();
    mod.default(mockPi as any);

    const agentStartHandler = registeredEvents.get("agent_start")!;
    agentStartHandler({}, mockCtx);

    expect(mockCtx.ui.setWidget).toHaveBeenCalledWith(
      "my-hud-memory-warning",
      undefined,
    );
  });

  it("agent_start shows memory warning widget when memory is high", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 87, ok: false });
    vi.mocked(findVitestProcesses).mockReturnValue([
      { pid: 44124, rssBytes: 1249328 * 1024, command: "node vitest.mjs run" },
      { pid: 44126, rssBytes: 1500 * 1024 * 1024, command: "node vitest.mjs run" },
    ]);

    const mod = await loadModule();
    mod.default(mockPi as any);

    const agentStartHandler = registeredEvents.get("agent_start")!;
    agentStartHandler({}, mockCtx);

    expect(mockCtx.ui.setWidget).toHaveBeenCalledWith(
      "my-hud-memory-warning",
      expect.any(Function),
      { placement: "aboveEditor" },
    );

    const factory = mockCtx.ui.setWidget.mock.calls.find(
      (call) => call[0] === "my-hud-memory-warning" && typeof call[1] === "function",
    )![1] as any;
    const component = factory(mockTui, mockTheme);
    const lines = component.render(200);

    expect(lines).toEqual([
      "⚠️ 内存 87% · vitest 44124(1.2GB), 44126(1.5GB)",
    ]);
  });

  it("agent_end also updates memory warning widget", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 87, ok: false });
    vi.mocked(findVitestProcesses).mockReturnValue([]);

    const mod = await loadModule();
    mod.default(mockPi as any);

    const agentEndHandler = registeredEvents.get("agent_end")!;
    agentEndHandler({}, mockCtx);

    expect(mockCtx.ui.setWidget).toHaveBeenCalledWith(
      "my-hud-memory-warning",
      expect.any(Function),
      { placement: "aboveEditor" },
    );
  });

  it("agent_start hides widget when theme is unavailable", async () => {
    vi.mocked(checkMemoryPressure).mockReturnValue({ percent: 87, ok: false });
    vi.mocked(findVitestProcesses).mockReturnValue([]);

    const mod = await loadModule();
    mod.default(mockPi as any);

    const agentStartHandler = registeredEvents.get("agent_start")!;
    const ctx = {
      ...mockCtx,
      ui: { ...mockCtx.ui, getTheme: vi.fn(() => undefined) },
    };
    agentStartHandler({}, ctx);

    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-hud-memory-warning",
      undefined,
    );
  });
});
