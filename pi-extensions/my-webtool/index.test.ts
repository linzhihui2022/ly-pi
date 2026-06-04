import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("./backends/tavily", () => ({
  Tavily: vi.fn().mockImplementation(function () {
    return {
      name: "tavily",
      label: "Tavily",
      check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
      search: vi.fn(),
      fetch: vi.fn(),
    };
  }),
}));

const mockRegisterTool = vi.fn();
const mockOn = vi.fn();
const mockRegisterCommand = vi.fn();
const mockPi: ExtensionAPI = {
  registerTool: mockRegisterTool,
  on: mockOn,
  registerCommand: mockRegisterCommand,
} as unknown as ExtensionAPI;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("myWebtool", () => {
  it("registers web_search and web_fetch tools", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const toolNames = mockRegisterTool.mock.calls.map((call) => call[0].name);
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("web_fetch");
  });

  it("calls tavily.check on load", async () => {
    const { Tavily } = await import("./backends/tavily");
    const mockCheck = vi.fn().mockResolvedValue({ enabled: true, message: "ok" });
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: mockCheck,
        search: vi.fn(),
        fetch: vi.fn(),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCheck).toHaveBeenCalled();
  });

  it("web_search has correct metadata", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];
    expect(webSearch.label).toBe("Web Search");
    expect(webSearch.executionMode).toBe("parallel");
    expect(webSearch.promptGuidelines).toContain("If Tavily is not enabled, skip this tool call.");
  });

  it("web_fetch has correct metadata", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];
    expect(webFetch.label).toBe("Web Fetch");
    expect(webFetch.executionMode).toBe("parallel");
    expect(webFetch.promptGuidelines).toContain("If Tavily is not enabled, skip this tool call.");
  });

  it("web_search execute returns error when provider not enabled", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const result = await webSearch.execute(
      "tool-call-id",
      { query: "test" },
      undefined,
      vi.fn(),
      {}
    );

    expect(result.content[0].text).toContain("No results found");
    expect(result.details.resultCount).toBe(0);
  });

  it("web_fetch execute returns error when provider not enabled", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const result = await webFetch.execute(
      "tool-call-id",
      { url: "https://example.com" },
      undefined,
      vi.fn(),
      {}
    );

    expect(result.content[0].text).toContain("Tavily is not enabled");
    expect(result.details.error).toBe("Tavily is not enabled");
  });

  it("web_search renderCall returns Text component", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
      bold: vi.fn((text: string) => text),
    };

    const text = webSearch.renderCall({ query: "test" }, theme as any, {});
    expect(text).toBeDefined();
  });

  it("web_search renderResult shows searching state", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webSearch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: true },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_search renderResult shows results count", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webSearch.renderResult(
      { content: [], details: { resultCount: 5, results: [] } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_search renderResult shows singular result", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webSearch.renderResult(
      { content: [], details: { resultCount: 1, results: [] } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_search renderResult handles missing details", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webSearch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_search renderResult expands to show results", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webSearch.renderResult(
      {
        content: [],
        details: {
          resultCount: 2,
          results: [
            { title: "A", url: "https://a.com", snippet: "..." },
          ],
        },
      },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_fetch renderCall returns Text component", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
      bold: vi.fn((text: string) => text),
    };

    const text = webFetch.renderCall({ url: "https://example.com" }, theme as any, {});
    expect(text).toBeDefined();
  });

  it("web_fetch renderResult shows fetching state", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webFetch.renderResult(
      { content: [], details: {} },
      { expanded: false, isPartial: true },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_fetch renderResult shows fetched state with title", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webFetch.renderResult(
      { content: [], details: { title: "Example" } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_fetch renderResult shows truncated state", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webFetch.renderResult(
      { content: [], details: { truncation: { truncated: true } } },
      { expanded: false, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_fetch renderResult expands to show content preview", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webFetch.renderResult(
      { content: [{ type: "text", text: "Hello world" }], details: {} },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_fetch renderResult skips non-text content when expanded", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
    };

    const text = webFetch.renderResult(
      { content: [{ type: "image", url: "http://x" }], details: {} },
      { expanded: true, isPartial: false },
      theme as any,
      {}
    );
    expect(text).toBeDefined();
  });

  it("web_search execute calls onUpdate and returns results", async () => {
    const { Tavily } = await import("./backends/tavily");
    const mockSearch = vi.fn().mockResolvedValue({
      ok: true,
      query: "test",
      results: [{ title: "Title", url: "https://example.com", snippet: "Snippet" }],
    });
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: mockSearch,
        fetch: vi.fn(),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const onUpdate = vi.fn();
    const result = await webSearch.execute(
      "tool-call-id",
      { query: "test" },
      undefined,
      onUpdate,
      {}
    );

    expect(onUpdate).toHaveBeenCalled();
    expect(result.content[0].text).toContain("Title");
    expect(result.details.resultCount).toBe(1);
  });

  it("web_search execute returns empty results when no results", async () => {
    const { Tavily } = await import("./backends/tavily");
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn().mockResolvedValue({ ok: true, query: "test", results: [] }),
        fetch: vi.fn(),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const result = await webSearch.execute("tool-call-id", { query: "test" }, undefined, vi.fn(), {});
    expect(result.content[0].text).toContain("No results found");
  });

  it("web_search execute handles search error", async () => {
    const { Tavily } = await import("./backends/tavily");
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn().mockResolvedValue({ ok: false, query: "test", error: "API error" }),
        fetch: vi.fn(),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webSearch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_search"
    )[0];

    const result = await webSearch.execute("tool-call-id", { query: "test" }, undefined, vi.fn(), {});
    expect(result.content[0].text).toContain("API error");
  });

  it("web_fetch execute returns fetched content", async () => {
    const { Tavily } = await import("./backends/tavily");
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          response: { text: "Hello world", contentType: "text/plain" },
        }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const onUpdate = vi.fn();
    const result = await webFetch.execute(
      "tool-call-id",
      { url: "https://example.com" },
      undefined,
      onUpdate,
      {}
    );

    expect(onUpdate).toHaveBeenCalled();
    expect(result.content[0].text).toContain("Hello world");
  });

  it("web_fetch execute handles fetch error", async () => {
    const { Tavily } = await import("./backends/tavily");
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn().mockResolvedValue({ ok: false, error: "Fetch failed" }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const result = await webFetch.execute("tool-call-id", { url: "https://example.com" }, undefined, vi.fn(), {});
    expect(result.content[0].text).toBe("Fetch failed");
  });

  it("web_fetch execute handles missing contentType", async () => {
    const { Tavily } = await import("./backends/tavily");
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          response: { text: "Hello", contentType: undefined as any },
        }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const result = await webFetch.execute("tool-call-id", { url: "https://example.com" }, undefined, vi.fn(), {});
    expect(result.content[0].text).toContain("Hello");
  });

  it("web_fetch execute truncates large content", async () => {
    const { Tavily } = await import("./backends/tavily");
    const largeContent = "x\n".repeat(2001);
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          response: { text: largeContent, contentType: "text/plain" },
        }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const webFetch = mockRegisterTool.mock.calls.find(
      (call) => call[0].name === "web_fetch"
    )[0];

    const result = await webFetch.execute("tool-call-id", { url: "https://example.com" }, undefined, vi.fn(), {});
    expect(result.content[0].text).toContain("truncated");
    expect(result.details.truncation).toBeDefined();
    expect(result.details.fullOutputPath).toBeDefined();
  });

  it("registers /webtool-usage command", async () => {
    const mod = await import("./index");
    mod.default(mockPi);

    const cmd = mockRegisterCommand.mock.calls.find(
      (call) => call[0] === "webtool-usage"
    );
    expect(cmd).toBeDefined();
    expect(cmd[1].description).toBe("Show Tavily usage statistics");
  });

  it("webtool-usage handler notifies on success", async () => {
    const { Tavily } = await import("./backends/tavily");
    const mockNotify = vi.fn();
    const mockSetStatus = vi.fn();
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn(),
        usage: vi.fn().mockResolvedValue({
          ok: true,
          key: { usage: 10, limit: 100, remaining: 90 },
          plan: { usage: 5, limit: 200, remaining: 195 },
          features: {},
        }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const cmd = mockRegisterCommand.mock.calls.find(
      (call) => call[0] === "webtool-usage"
    );
    const handler = cmd[1].handler;
    await handler("", { ui: { notify: mockNotify, setStatus: mockSetStatus } } as any);

    expect(mockSetStatus).toHaveBeenCalledWith("my-webtool", "Checking Tavily usage...");
    expect(mockSetStatus).toHaveBeenLastCalledWith("my-webtool", "");
    expect(mockNotify).toHaveBeenCalledWith(
      "Tavily: key 10/100 used (90 remaining); plan 5/200 used (195 remaining)",
      "info"
    );
  });

  it("webtool-usage handler notifies on error", async () => {
    const { Tavily } = await import("./backends/tavily");
    const mockNotify = vi.fn();
    const mockSetStatus = vi.fn();
    vi.mocked(Tavily).mockImplementation(function () {
      return {
        name: "tavily",
        label: "Tavily",
        check: vi.fn().mockResolvedValue({ enabled: true, message: "ok" }),
        search: vi.fn(),
        fetch: vi.fn(),
        usage: vi.fn().mockResolvedValue({
          ok: false,
          error: "API key missing",
        }),
      } as any;
    });

    const mod = await import("./index");
    mod.default(mockPi);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const cmd = mockRegisterCommand.mock.calls.find(
      (call) => call[0] === "webtool-usage"
    );
    const handler = cmd[1].handler;
    await handler("", { ui: { notify: mockNotify, setStatus: mockSetStatus } } as any);

    expect(mockSetStatus).toHaveBeenCalledWith("my-webtool", "Checking Tavily usage...");
    expect(mockSetStatus).toHaveBeenLastCalledWith("my-webtool", "");
    expect(mockNotify).toHaveBeenCalledWith(
      "Usage check failed: API key missing",
      "error"
    );
  });
});
