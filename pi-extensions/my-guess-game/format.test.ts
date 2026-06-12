import { describe, it, expect } from "vitest";
import {
  buildToolResult,
  formatGenerationPrompt,
  formatRefereePrompt,
  formatAnswerPrompt,
  formatJudgementPrompt,
  formatReplay,
  parseCharacter,
  normalizeYesNoUnknown,
  normalizeJudgement,
  buildErrorResult,
  buildSubmitSuccessResult,
  buildSubmitFailureResult,
} from "./format";
import { createGameState, recordAnswer, recordWrongGuess } from "./state";

describe("buildToolResult", () => {
  it("builds a normal result", () => {
    const result = buildToolResult("hello", { foo: 1 });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.details).toEqual({ foo: 1 });
    expect(result.isError).toBeUndefined();
  });

  it("builds an error result", () => {
    const result = buildToolResult("error", { foo: 1 }, true);
    expect(result.isError).toBe(true);
  });
});

describe("formatGenerationPrompt", () => {
  it("includes category hint for non-any", () => {
    const prompt = formatGenerationPrompt("science");
    expect(prompt).toContain("科学");
    expect(prompt).toContain("名字：");
    expect(prompt).toContain("简介：");
  });

  it("omits category hint for any", () => {
    const prompt = formatGenerationPrompt("any");
    expect(prompt).not.toContain("请选择与");
  });
});

describe("formatRefereePrompt", () => {
  it("includes target, summary, rules, and session id", () => {
    const prompt = formatRefereePrompt("Alice", "A scientist", "session-1");
    expect(prompt).toContain("【秘密人物】Alice");
    expect(prompt).toContain("【简介】A scientist");
    expect(prompt).toContain("ask_guess_question");
    expect(prompt).toContain("submit_guess");
    expect(prompt).toContain("session-1");
  });
});

describe("formatAnswerPrompt", () => {
  it("includes target, summary, and question", () => {
    const prompt = formatAnswerPrompt("Alice", "A scientist", "Is she real?");
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("Is she real?");
    expect(prompt).toContain("Yes / No / Unknown");
  });
});

describe("formatJudgementPrompt", () => {
  it("includes target, summary, and guess", () => {
    const prompt = formatJudgementPrompt("Alice", "A scientist", "Bob");
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("用户猜测：Bob");
    expect(prompt).toContain("correct");
    expect(prompt).toContain("incorrect");
  });
});

describe("formatReplay", () => {
  it("returns empty string for empty history", () => {
    expect(formatReplay([])).toBe("");
  });

  it("formats history entries", () => {
    const replay = formatReplay([
      { question: "Q1", answer: "Yes" },
      { question: "Q2", answer: "No" },
    ]);
    expect(replay).toContain("Q1 → Yes");
    expect(replay).toContain("Q2 → No");
  });
});

describe("parseCharacter", () => {
  it("parses valid output", () => {
    const parsed = parseCharacter("名字：孙悟空\n简介：神话人物");
    expect(parsed).toEqual({ target: "孙悟空", summary: "神话人物" });
  });

  it("trims whitespace", () => {
    const parsed = parseCharacter("  名字： Alice \n  简介： A scientist  ");
    expect(parsed).toEqual({ target: "Alice", summary: "A scientist" });
  });

  it("returns undefined when target missing", () => {
    const parsed = parseCharacter("简介：Only summary");
    expect(parsed).toBeUndefined();
  });

  it("returns undefined when summary missing", () => {
    const parsed = parseCharacter("名字：Only name");
    expect(parsed).toBeUndefined();
  });

  it("returns undefined for empty", () => {
    expect(parseCharacter("")).toBeUndefined();
  });
});

describe("normalizeYesNoUnknown", () => {
  it.each([
    ["Yes", "Yes"],
    ["yes", "Yes"],
    ["YES", "Yes"],
    ["No", "No"],
    ["no", "No"],
    ["NO", "No"],
    ["Unknown", "Unknown"],
    ["unknown", "Unknown"],
    ["UNKNOWN", "Unknown"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeYesNoUnknown(input)).toBe(expected);
  });

  it("returns undefined for invalid", () => {
    expect(normalizeYesNoUnknown("Maybe")).toBeUndefined();
  });
});

describe("normalizeJudgement", () => {
  it.each([
    ["correct", "correct"],
    ["Correct", "correct"],
    ["CORRECT", "correct"],
    ["incorrect", "incorrect"],
    ["Incorrect", "incorrect"],
    ["INCORRECT", "incorrect"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeJudgement(input)).toBe(expected);
  });

  it("returns undefined for invalid", () => {
    expect(normalizeJudgement("maybe")).toBeUndefined();
  });
});

describe("buildErrorResult", () => {
  it("returns error envelope", () => {
    const result = buildErrorResult("no_active_game", "No active game");
    expect(result.content[0].text).toBe("No active game");
    expect(result.details).toEqual({ error: "no_active_game" });
    expect(result.isError).toBe(true);
  });
});

describe("buildSubmitSuccessResult", () => {
  it("reveals target and history", () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    recordAnswer(state, "Q1", "Yes");
    const result = buildSubmitSuccessResult(state, "Alice");
    expect(result.content[0].text).toContain("Alice");
    expect(result.content[0].text).toContain("A scientist");
    expect(result.details.correct).toBe(true);
    expect(result.details.target).toBe("Alice");
    expect(result.details.history).toEqual([{ question: "Q1", answer: "Yes" }]);
  });
});

describe("buildSubmitFailureResult", () => {
  it("keeps target hidden and records wrong guess", () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    recordWrongGuess(state, "Bob");
    const result = buildSubmitFailureResult(state, "Bob");
    expect(result.content[0].text).toBe("No");
    expect(result.details.correct).toBe(false);
    expect(result.details.target).toBeUndefined();
    expect(result.details.wrongGuesses).toEqual(["Bob"]);
  });
});
