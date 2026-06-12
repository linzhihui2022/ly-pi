import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const registeredTools: any[] = [];

const mockPi = {
  registerTool: vi.fn((def: any) => {
    registeredTools.push(def);
  }),
};

function makeCtx(sessionId: string, hasModel = true): ExtensionContext {
  return {
    sessionManager: {
      getSessionId: vi.fn(() => sessionId),
    },
    model: hasModel
      ? {
          id: "test-model",
          name: "Test",
          api: "openai-responses",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        }
      : undefined,
    hasUI: false,
  } as unknown as ExtensionContext;
}

async function loadModule() {
  return await import("./index");
}

beforeEach(() => {
  registeredTools.length = 0;
  vi.clearAllMocks();
});

describe("my-guess-game extension", () => {
  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers three tools", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(registeredTools.map((t) => t.name)).toEqual([
      "play_guess_game",
      "ask_guess_question",
      "submit_guess",
    ]);
  });

  it("play_guess_game returns error when no model", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "play_guess_game");
    const result = await tool.execute("tc", {}, undefined, undefined, makeCtx("s1", false));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_llm");
  });

  it("ask_guess_question returns no_active_game when missing", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "ask_guess_question");
    const result = await tool.execute("tc", { question: "Q?" }, undefined, undefined, makeCtx("s1"));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_active_game");
  });

  it("submit_guess returns no_active_game when missing", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "submit_guess");
    const result = await tool.execute("tc", { guess: "Alice" }, undefined, undefined, makeCtx("s1"));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_active_game");
  });
});
