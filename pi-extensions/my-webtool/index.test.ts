import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const mockRegisterTool = vi.fn();
const mockOn = vi.fn();
const mockPi: ExtensionAPI = {
  registerTool: mockRegisterTool,
  on: mockOn,
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

  it("registers session_start handler", async () => {
    const mod = await import("./index");
    mod.default(mockPi);
    expect(mockOn).toHaveBeenCalledWith("session_start", expect.any(Function));
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
});
