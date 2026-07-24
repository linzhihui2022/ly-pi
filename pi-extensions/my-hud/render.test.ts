import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStatusLine } from "./render";
import { getCapabilities } from "@earendil-works/pi-tui";

vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (text: string, _width: number) => text,
  hyperlink: (text: string, url: string) => `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`,
  getCapabilities: vi.fn(() => ({ images: null, trueColor: true, hyperlinks: true })),
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
    expect(line).toContain("\u001b]8;;https://github.com/owner/repo/pull/42\u0007");
    expect(line).toContain("\u001b]8;;\u0007");
  });

  it("falls back to plain PR number when hyperlinks are not supported", () => {
    vi.mocked(getCapabilities).mockReturnValue({ images: null, trueColor: true, hyperlinks: false });
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      pullRequest: { number: 42, url: "https://github.com/owner/repo/pull/42" },
    });
    expect(line).toContain("#42");
    expect(line).not.toContain("\u001b]8;;");
  });

  it("hides permission stats when judgeStats is undefined", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, baseData);
    expect(line).not.toContain("/");
  });

  it("hides permission stats when both counts are zero", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      judgeStats: { allowed: 0, denied: 0 },
    });
    expect(line).not.toContain("/");
  });

  it("shows permission stats when counts are non-zero", () => {
    const theme = createMockTheme();
    const line = buildStatusLine(theme, 200, {
      ...baseData,
      judgeStats: { allowed: 12, denied: 3 },
    });
    expect(line).toContain("12/3");
  });
});
