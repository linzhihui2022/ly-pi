import { describe, expect, it } from "vitest";
import {
  DECLINE_MESSAGE,
  ENVELOPE_PREFIX,
  ENVELOPE_SUFFIX,
  buildAnswerSegment,
  buildQuestionnaireResponse,
  buildToolResult,
  formatAnswerScalar,
} from "./format";
import type { QuestionAnswer, QuestionParams, QuestionnaireResult } from "./types";

function makeParams(questions: QuestionParams["questions"]): QuestionParams {
  return { questions };
}

describe("buildToolResult", () => {
  it("wraps text and details", () => {
    const details: QuestionnaireResult = { answers: [], cancelled: true };
    expect(buildToolResult("hello", details)).toEqual({
      content: [{ type: "text", text: "hello" }],
      details,
    });
  });
});

describe("formatAnswerScalar", () => {
  it("returns option label or placeholder", () => {
    const a: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "option", answer: "A" };
    expect(formatAnswerScalar(a, "envelope")).toBe("A");
    const b: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "option", answer: null };
    expect(formatAnswerScalar(b, "envelope")).toBe("(no input)");
  });

  it("returns custom text or placeholder", () => {
    const a: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "custom", answer: "typed" };
    expect(formatAnswerScalar(a, "envelope")).toBe("typed");
    const b: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "custom", answer: "" };
    expect(formatAnswerScalar(b, "envelope")).toBe("(no input)");
    const c: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "custom", answer: null };
    expect(formatAnswerScalar(c, "envelope")).toBe("(no input)");
  });

  it("returns multi selections or placeholder", () => {
    const a: QuestionAnswer = {
      questionIndex: 0,
      question: "Q",
      kind: "multi",
      answer: null,
      selected: ["A", "B"],
    };
    expect(formatAnswerScalar(a, "envelope")).toBe("A, B");
    const b: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "multi", answer: null, selected: [] };
    expect(formatAnswerScalar(b, "envelope")).toBe("(no input)");
    const c: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "multi", answer: null };
    expect(formatAnswerScalar(c, "envelope")).toBe("(no input)");
  });

  it("returns chat continuation in envelope variant", () => {
    const a: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "chat", answer: "Chat about this" };
    expect(formatAnswerScalar(a, "envelope")).toContain("Continue the conversation");
  });

  it("returns chat summary in summary variant", () => {
    const a: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "chat", answer: "Chat about this" };
    expect(formatAnswerScalar(a, "summary")).toBe("User wants to chat about this");
  });
});

describe("buildAnswerSegment", () => {
  it("formats option answer", () => {
    const a: QuestionAnswer = { questionIndex: 0, question: "Q", kind: "option", answer: "A" };
    expect(buildAnswerSegment(a)).toBe('"Q"="A".');
  });

  it("appends preview", () => {
    const a: QuestionAnswer = {
      questionIndex: 0,
      question: "Q",
      kind: "option",
      answer: "A",
      preview: "code",
    };
    expect(buildAnswerSegment(a)).toBe('"Q"="A". selected preview: code.');
  });

  it("ignores empty preview", () => {
    const a: QuestionAnswer = {
      questionIndex: 0,
      question: "Q",
      kind: "option",
      answer: "A",
      preview: "",
    };
    expect(buildAnswerSegment(a)).toBe('"Q"="A".');
  });
});

describe("buildQuestionnaireResponse", () => {
  const params = makeParams([
    { question: "Q1?", header: "A", options: [{ label: "A", description: "a" }, { label: "B", description: "b" }] },
    { question: "Q2?", header: "B", options: [{ label: "C", description: "c" }, { label: "D", description: "d" }] },
  ]);

  it("returns decline message when cancelled", () => {
    const result: QuestionnaireResult = { answers: [], cancelled: true };
    const toolResult = buildQuestionnaireResponse(result, params);
    expect(toolResult.content[0].text).toBe(DECLINE_MESSAGE);
    expect(toolResult.details.cancelled).toBe(true);
  });

  it("returns decline message when result is nullish", () => {
    const toolResult = buildQuestionnaireResponse(undefined, params);
    expect(toolResult.content[0].text).toBe(DECLINE_MESSAGE);
    expect(toolResult.details.cancelled).toBe(true);
  });

  it("returns decline message when no answers", () => {
    const result: QuestionnaireResult = { answers: [], cancelled: false };
    const toolResult = buildQuestionnaireResponse(result, params);
    expect(toolResult.content[0].text).toBe(DECLINE_MESSAGE);
  });

  it("builds envelope for answered questions in order", () => {
    const result: QuestionnaireResult = {
      answers: [
        { questionIndex: 0, question: "Q1?", kind: "option", answer: "A" },
        { questionIndex: 1, question: "Q2?", kind: "option", answer: "C" },
      ],
      cancelled: false,
    };
    const toolResult = buildQuestionnaireResponse(result, params);
    expect(toolResult.content[0].text).toContain(ENVELOPE_PREFIX);
    expect(toolResult.content[0].text).toContain(ENVELOPE_SUFFIX);
    expect(toolResult.content[0].text).toContain('"Q1?"="A". "Q2?"="C".');
  });

  it("omits unanswered questions from envelope", () => {
    const result: QuestionnaireResult = {
      answers: [{ questionIndex: 1, question: "Q2?", kind: "option", answer: "C" }],
      cancelled: false,
    };
    const toolResult = buildQuestionnaireResponse(result, params);
    expect(toolResult.content[0].text).not.toContain("Q1");
    expect(toolResult.content[0].text).toContain("Q2");
  });
});
