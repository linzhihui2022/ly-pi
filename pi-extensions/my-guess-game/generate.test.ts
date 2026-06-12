import { describe, it, expect, vi } from "vitest";
import { generateCharacter } from "./generate";
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

describe("generateCharacter", () => {
  it("returns error when model is undefined", async () => {
    const result = await generateCharacter("any", undefined, vi.fn());
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("no_llm");
  });

  it("returns generated character on valid response", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("名字：孙悟空\n简介：神话人物"));
    const result = await generateCharacter("any", makeModel(), complete as any);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.target).toBe("孙悟空");
      expect(result.summary).toBe("神话人物");
    }
  });

  it("returns error when parse fails", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("invalid"));
    const result = await generateCharacter("any", makeModel(), complete as any);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("generation_failed");
  });

  it("passes category to prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("名字：孙悟空\n简介：神话人物"));
    await generateCharacter("science", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("科学");
  });
});
