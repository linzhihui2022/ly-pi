import { describe, it, expect, vi, afterEach } from "vitest";
import { Bar } from "./bar";

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

vi.mock("./pr", () => ({
  getRemoteUrl: vi.fn(() => Promise.resolve("https://github.com/owner/repo.git")),
  parseRemoteUrl: vi.fn(() => ({ owner: "owner", repo: "repo" })),
  getPullRequestNumber: vi.fn(() =>
    Promise.resolve({
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    }),
  ),
}));

import { getPullRequestNumber, getRemoteUrl, parseRemoteUrl } from "./pr";

function createMockTheme(): any {
  return {
    fg: vi.fn((_c: string, text: string) => text),
  };
}

const mockTui = { requestRender: vi.fn() };

const createCtx = (overrides?: { branch?: string }) => ({
  cwd: "/x",
  model: { id: "m" },
  sessionManager: { getEntries: () => [] },
  getContextUsage: () => ({ percent: 0, contextWindow: 128000 }),
  ...overrides,
});

describe("Bar PR caching", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });


  it("renders PR number when pull request is found", async () => {
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    component.render(200); // trigger async fetch
    await new Promise((r) => setTimeout(r, 50));

    const lines = component.render(200); // re-render with cached PR

    expect(lines[0]).toContain("#42");
  });

  it("handles PR fetch failure gracefully", async () => {
    vi.mocked(getPullRequestNumber).mockRejectedValueOnce(new Error("api failed"));
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    const lines = component.render(200);
    expect(lines[0]).not.toContain("#42");
  });

  it("does not fetch PR when branch is null", async () => {
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();

    bar.setUICtx({ setWidget } as any);
    bar.setContext(createCtx({ branch: undefined }) as any);
    bar.setBranch(null);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(getPullRequestNumber).not.toHaveBeenCalled();
  });

  it("handles null remote URL gracefully", async () => {
    vi.mocked(getRemoteUrl).mockResolvedValueOnce(null);
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    const lines = component.render(200);
    expect(lines[0]).not.toContain("#42");
  });

  it("handles non-GitHub remote URL gracefully", async () => {
    vi.mocked(getRemoteUrl).mockResolvedValueOnce("https://gitlab.com/owner/repo.git");
    vi.mocked(parseRemoteUrl).mockReturnValueOnce(null);
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);
    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    const lines = component.render(200);
    expect(lines[0]).not.toContain("#42");
  });

  it("does not start duplicate PR fetches while one is pending", async () => {
    vi.mocked(getPullRequestNumber).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        number: 42,
        url: "https://github.com/owner/repo/pull/42",
      }), 100)),
    );

    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    component.render(200); // starts fetch
    component.render(200); // should not start another while pending

    await new Promise((r) => setTimeout(r, 150));
    expect(getPullRequestNumber).toHaveBeenCalledTimes(1);
  });

  it("caches PR info and does not refetch within TTL", async () => {
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(getPullRequestNumber).toHaveBeenCalledTimes(1);
  });

  it("invalidates PR cache and refetches after branch changes", async () => {
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as any);
    bar.setContext(ctx as any);
    bar.setBranch("feature-x");
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    vi.mocked(getPullRequestNumber).mockClear();

    bar.setBranch("feature-y");
    bar.invalidatePullRequest();
    component.render(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(getPullRequestNumber).toHaveBeenCalledTimes(1);
  });
});
