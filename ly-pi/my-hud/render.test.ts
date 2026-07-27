import { getCapabilities } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStatusLine, setHiddenFields } from "./render";

vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (text: string, _width: number) => text,
  hyperlink: (text: string, url: string) =>
    `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`,
  getCapabilities: vi.fn(() => ({
    images: null,
    trueColor: true,
    hyperlinks: true,
  })),
}));

function createMockTheme(): any {
  return {
    fg: vi.fn((_c: string, text: string) => text),
  };
}

const baseData = {
  project: "my-project",
  modelName: "gpt-4",
  branch: "main",
  ctxColored: "42%",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  },
};

describe("buildStatusLine with PR", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("omits PR number when pullRequest is null", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      pullRequest: null,
    });
    expect(line).toContain("main");
    expect(line).not.toContain("#");
  });

  it("omits PR number when pullRequest is undefined", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, baseData);
    expect(line).toContain("main");
    expect(line).not.toContain("#");
  });

  it("appends PR number when pullRequest is provided", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      pullRequest: { number: 42, url: "https://github.com/owner/repo/pull/42" },
    });
    expect(line).toContain("main");
    expect(line).toContain("#42");
    expect(line).toContain("https://github.com/owner/repo/pull/42");
  });

  it("wraps PR number in OSC 8 hyperlink when hyperlinks are supported", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      pullRequest: { number: 42, url: "https://github.com/owner/repo/pull/42" },
    });
    expect(line).toContain(
      "\u001b]8;;https://github.com/owner/repo/pull/42\u0007",
    );
    expect(line).toContain("\u001b]8;;\u0007");
  });

  it("falls back to plain PR number when hyperlinks are not supported", () => {
    vi.mocked(getCapabilities).mockReturnValue({
      images: null,
      trueColor: true,
      hyperlinks: false,
    });
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      pullRequest: { number: 42, url: "https://github.com/owner/repo/pull/42" },
    });
    expect(line).toContain("#42");
    expect(line).not.toContain("\u001b]8;;");
  });

  it("shows judge counts and CNY cost together", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      judgeStats: { allowed: 12, denied: 3 },
      judgeCost: 0.49,
    });
    expect(line).toContain("12/3/0.49");
  });
});

describe("hiddenFields", () => {
  afterEach(() => {
    setHiddenFields([]);
  });

  const dirtyGitStatus = {
    ahead: 0,
    behind: 0,
    staged: 2,
    unstaged: 0,
    untracked: 0,
    stashed: 0,
    conflicted: 0,
    isClean: false,
  };

  const richData = {
    ...baseData,
    usage: {
      input: 1234,
      output: 5678,
      cacheRead: 999,
      cacheWrite: 0,
      cost: 1.5,
    },
    gitStatus: dirtyGitStatus,
  };

  it("shows all fields by default", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, richData);
    expect(line).toContain("my-project");
    expect(line).toContain("gpt-4");
    expect(line).toContain("main");
    expect(line).toContain("++2");
    expect(line).toContain("42%");
    expect(line).toContain("1.2k");
    expect(line).toContain("5.7k");
    expect(line).toContain("999");
    expect(line).toContain("1.50");
    expect(line).toContain("45%");
  });

  it("hides every configured field", () => {
    setHiddenFields([
      "project",
      "model",
      "branch",
      "gitStatus",
      "context",
      "input",
      "output",
      "cacheRead",
      "cost",
      "cacheRate",
      "permission",
    ]);
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, richData);
    expect(line).not.toContain("my-project");
    expect(line).not.toContain("gpt-4");
    expect(line).not.toContain("main");
    expect(line).not.toContain("++2");
    expect(line).not.toContain("42%");
    expect(line).not.toContain("1.2k");
    expect(line).not.toContain("5.7k");
    expect(line).not.toContain("999");
    expect(line).not.toContain("1.50");
    expect(line).not.toContain("45%");
  });

  it("hides git status independently of branch", () => {
    setHiddenFields(["gitStatus"]);
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, richData);
    expect(line).toContain("main");
    expect(line).not.toContain("++2");
  });

  it("hides judge cost while preserving judge counts when cost is hidden", () => {
    setHiddenFields(["cost"]);
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...richData,
      judgeStats: { allowed: 12, denied: 3 },
      judgeCost: 0.49,
    });
    expect(line).toContain("12/3");
    expect(line).not.toContain("12/3/0.49");
  });

  it("hides branch but keeps git status", () => {
    setHiddenFields(["branch"]);
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, richData);
    expect(line).not.toContain("main");
    expect(line).toContain("++2");
  });

  it("ignores unknown field names", () => {
    setHiddenFields(["bogus"]);
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, richData);
    expect(line).toContain("my-project");
    expect(line).toContain("gpt-4");
    expect(line).toContain("main");
    expect(line).toContain("1.50");
  });
});
