import { describe, it, expect, vi } from "vitest";
import { judgeGuess } from "./judge";
import { createGameState } from "./state";
import type { Model, Api, AssistantMessage } from "@earendil-works/pi-ai";

function makeModel(): Model<Api> {
  return {
    id: "test-model",
    name: "Test Model",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("judgeGuess", () => {
  it("returns error when model is undefined", async () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", undefined, vi.fn());
    expect(typeof result === "object" && "error" in result).toBe(true);
  });

  it.each([
    ["correct", true],
    ["Correct", true],
    ["CORRECT", true],
    ["incorrect", false],
    ["Incorrect", false],
    ["INCORRECT", false],
  ])("judges %s as %s", async (raw, expected) => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage(raw));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", makeModel(), complete as any);
    expect(result).toBe(expected);
  });

  it("returns ambiguous_guess error on invalid judgement", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("maybe"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", makeModel(), complete as any);
    expect(typeof result === "object" && "error" in result).toBe(true);
    if (typeof result === "object" && "error" in result) {
      expect(result.error).toBe("ambiguous_guess");
    }
  });

  it("includes target and guess in prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("correct"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    await judgeGuess(state, "Alice", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("用户猜测：Alice");
  });
});
