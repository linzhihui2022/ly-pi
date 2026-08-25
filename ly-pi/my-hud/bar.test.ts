import type {
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  getRemoteUrl: vi.fn(() =>
    Promise.resolve("https://github.com/owner/repo.git"),
  ),
  parseRemoteUrl: vi.fn(() => ({ owner: "owner", repo: "repo" })),
  getPullRequestNumber: vi.fn(() =>
    Promise.resolve({
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    }),
  ),
}));

vi.mock("./hide-thinking", () => ({
  getHideThinking: vi.fn(() => false),
}));

import { getHideThinking } from "./hide-thinking";
import { getPullRequestNumber, getRemoteUrl, parseRemoteUrl } from "./pr";

function createMockTheme(): any {
  return {
    fg: vi.fn((_c: string, text: string) => text),
  };
}

const mockTui = { requestRender: vi.fn() };

const createCtx = (overrides?: {
  branch?: string;
  model?: { provider: string; id: string };
}) => ({
  cwd: "/x",
  model: { provider: "test", id: "m" },
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

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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
    vi.mocked(getPullRequestNumber).mockRejectedValueOnce(
      new Error("api failed"),
    );
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(
      createCtx({ branch: undefined }) as unknown as ExtensionContext,
    );
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

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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
    vi.mocked(getRemoteUrl).mockResolvedValueOnce(
      "https://gitlab.com/owner/repo.git",
    );
    vi.mocked(parseRemoteUrl).mockReturnValueOnce(null);
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                number: 42,
                url: "https://github.com/owner/repo/pull/42",
              }),
            100,
          ),
        ),
    );

    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({ branch: "feature-x" });

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
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

  it("renders judge records and their CNY cost", () => {
    const entries = [
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "allowed", cost: 0.05 },
      },
      {
        type: "custom",
        customType: "my-permission-judge",
        data: { decision: "denied", cost: 0.02 },
      },
    ];
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = {
      ...createCtx(),
      sessionManager: { getEntries: () => entries },
    };

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    expect(component.render(200)[0]).toContain("1/1/0.49");
  });

  it("uses the effective candidate's Model Label for a known active model", () => {
    const labelForModel = vi.fn(({ provider, id }) =>
      provider === "test" && id === "m" ? "Fast label" : undefined,
    );
    const bar = new Bar(undefined, labelForModel);
    const setWidget = vi.fn();
    const theme = createMockTheme();

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(createCtx() as unknown as ExtensionContext);
    bar.update();

    const component = setWidget.mock.calls[0][1](mockTui, theme);
    const line = component.render(200)[0];

    expect(labelForModel).toHaveBeenCalledWith({ provider: "test", id: "m" });
    expect(line).toContain("Fast label");
    expect(line).not.toContain("test/m");
  });

  it("keeps an unknown active model's provider-qualified identifier", () => {
    const bar = new Bar(undefined, () => undefined);
    const setWidget = vi.fn();
    const theme = createMockTheme();
    const ctx = createCtx({
      model: { provider: "recovered", id: "fallback" },
    });

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(ctx as unknown as ExtensionContext);
    bar.update();

    const component = setWidget.mock.calls[0][1](mockTui, theme);

    expect(component.render(200)[0]).toContain("recovered/fallback");
  });

  it("shows the hideThinking indicator when settings enable it", () => {
    vi.mocked(getHideThinking).mockReturnValue(true);
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(createCtx() as unknown as ExtensionContext);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    expect(component.render(200)[0]).toContain("\uf070");
    expect(component.render(200)[0]).not.toContain("\uf06e");
  });

  it("shows the visible-thinking icon when settings disable it", () => {
    vi.mocked(getHideThinking).mockReturnValue(false);
    const bar = new Bar();
    const setWidget = vi.fn();
    const theme = createMockTheme();

    bar.setUICtx({ setWidget } as unknown as ExtensionUIContext);
    bar.setContext(createCtx() as unknown as ExtensionContext);
    bar.update();

    const factory = setWidget.mock.calls[0][1];
    const component = factory(mockTui, theme);

    expect(component.render(200)[0]).toContain("\uf06e");
    expect(component.render(200)[0]).not.toContain("\uf070");
  });
});
