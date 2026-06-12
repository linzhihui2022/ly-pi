import { describe, it, expect, vi } from "vitest";
import { answerQuestion } from "./answer";
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

describe("answerQuestion", () => {
  it("returns error when model is undefined", async () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", undefined, vi.fn());
    expect(typeof result === "object" && "error" in result).toBe(true);
  });

  it.each([
    ["Yes", "Yes"],
    ["No", "No"],
    ["Unknown", "Unknown"],
    ["yes", "Yes"],
    ["no", "No"],
    ["unknown", "Unknown"],
  ])("normalizes %s to %s", async (raw, expected) => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage(raw));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", makeModel(), complete as any);
    expect(result).toBe(expected);
  });

  it("falls back to Unknown on invalid response", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("Maybe"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", makeModel(), complete as any);
    expect(result).toBe("Unknown");
  });

  it("includes target and question in prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("Yes"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    await answerQuestion(state, "Is she real?", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("Is she real?");
  });
});
