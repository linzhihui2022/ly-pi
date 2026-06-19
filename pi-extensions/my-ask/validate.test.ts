import { describe, expect, it } from "vitest";
import {
  ERROR_DUPLICATE_OPTION_LABEL,
  ERROR_DUPLICATE_QUESTION,
  ERROR_NO_QUESTIONS,
  ERROR_RESERVED_LABEL,
  ERROR_TOO_FEW_OPTIONS,
  ERROR_TOO_MANY_QUESTIONS,
  validateQuestionnaire,
} from "./validate";
import type { QuestionParams } from "./types";

function makeParams(questions: QuestionParams["questions"]): QuestionParams {
  return { questions };
}

describe("validateQuestionnaire", () => {
  it("accepts a valid single question", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Which color?",
          header: "Color",
          options: [
            { label: "Red", description: "Warm" },
            { label: "Blue", description: "Cool" },
          ],
        },
      ]),
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts a valid multi-select question", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Which features?",
          header: "Features",
          multiSelect: true,
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
            { label: "C", description: "c" },
          ],
        },
      ]),
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects zero questions", () => {
    const result = validateQuestionnaire(makeParams([]));
    expect(result).toEqual({
      ok: false,
      error: "no_questions",
      message: ERROR_NO_QUESTIONS,
    });
  });

  it("rejects more than 4 questions", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Q1?",
          header: "Q1",
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
          ],
        },
        {
          question: "Q2?",
          header: "Q2",
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
          ],
        },
        {
          question: "Q3?",
          header: "Q3",
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
          ],
        },
        {
          question: "Q4?",
          header: "Q4",
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
          ],
        },
        {
          question: "Q5?",
          header: "Q5",
          options: [
            { label: "A", description: "a" },
            { label: "B", description: "b" },
          ],
        },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "too_many_questions",
      message: ERROR_TOO_MANY_QUESTIONS,
    });
  });

  it("rejects duplicate question text", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Same?",
          header: "A",
          options: [
            { label: "X", description: "x" },
            { label: "Y", description: "y" },
          ],
        },
        {
          question: "Same?",
          header: "B",
          options: [
            { label: "X", description: "x" },
            { label: "Y", description: "y" },
          ],
        },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "duplicate_question",
      message: ERROR_DUPLICATE_QUESTION,
    });
  });

  it("rejects fewer than 2 options", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Only one?",
          header: "One",
          options: [{ label: "A", description: "a" }],
        },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "empty_options",
      message: ERROR_TOO_FEW_OPTIONS,
    });
  });

  it("rejects duplicate option labels within a question", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Dup?",
          header: "Dup",
          options: [
            { label: "Same", description: "x" },
            { label: "Same", description: "y" },
          ],
        },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "duplicate_option_label",
      message: ERROR_DUPLICATE_OPTION_LABEL,
    });
  });

  it("rejects each reserved label", () => {
    for (const label of [
      "Other",
      "Type something.",
      "Chat about this",
      "Next",
    ]) {
      const result = validateQuestionnaire(
        makeParams([
          {
            question: "Reserved?",
            header: "Res",
            options: [
              { label, description: "bad" },
              { label: "Valid", description: "ok" },
            ],
          },
        ]),
      );
      expect(result).toEqual({
        ok: false,
        error: "reserved_label",
        message: ERROR_RESERVED_LABEL,
      });
    }
  });

  it("short-circuits reserved_label before duplicate_option_label", () => {
    const result = validateQuestionnaire(
      makeParams([
        {
          question: "Reserved dup?",
          header: "RD",
          options: [
            { label: "Type something.", description: "bad" },
            { label: "Type something.", description: "also bad" },
          ],
        },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: "reserved_label",
      message: ERROR_RESERVED_LABEL,
    });
  });
});
