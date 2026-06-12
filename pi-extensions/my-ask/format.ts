import type { QuestionAnswer, QuestionParams, QuestionnaireResult } from "./types";

export const DECLINE_MESSAGE = "User declined to answer questions";
export const ENVELOPE_PREFIX = "User has answered your questions:";
export const ENVELOPE_SUFFIX = "You can now continue with the user's answers in mind.";

export const CHAT_CONTINUATION_MESSAGE =
  "User wants to chat about this. Continue the conversation to help them decide.";
export const CHAT_SUMMARY_MESSAGE = "User wants to chat about this";
export const NO_INPUT_PLACEHOLDER = "(no input)";

export type FormatAnswerVariant = "summary" | "envelope";

/**
 * Render a single answer to its scalar text form.
 * The `chat` branch changes between the LLM-facing envelope and the on-screen summary.
 */
export function formatAnswerScalar(a: QuestionAnswer, variant: FormatAnswerVariant): string {
  switch (a.kind) {
    case "chat":
      return variant === "envelope" ? CHAT_CONTINUATION_MESSAGE : CHAT_SUMMARY_MESSAGE;
    case "multi":
      return a.selected && a.selected.length > 0 ? a.selected.join(", ") : NO_INPUT_PLACEHOLDER;
    case "custom":
      return a.answer && a.answer.length > 0 ? a.answer : NO_INPUT_PLACEHOLDER;
    case "option":
      return a.answer ?? NO_INPUT_PLACEHOLDER;
  }
}

/**
 * Build one `"Q"="A"` segment, optionally appending preview metadata.
 */
export function buildAnswerSegment(a: QuestionAnswer): string {
  const parts: string[] = [`"${a.question}"="${formatAnswerScalar(a, "envelope")}"`];
  if (a.preview && a.preview.length > 0) parts.push(`selected preview: ${a.preview}`);
  return `${parts.join(". ")}.`;
}

/**
 * Wrap text and details into the canonical tool result shape.
 */
export function buildToolResult(text: string, details: QuestionnaireResult) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

/**
 * Convert the questionnaire result into the LLM-facing tool result.
 */
export function buildQuestionnaireResponse(
  result: QuestionnaireResult | null | undefined,
  params: QuestionParams,
) {
  if (!result || result.cancelled) {
    return buildToolResult(DECLINE_MESSAGE, {
      answers: result?.answers ?? [],
      cancelled: true,
    });
  }

  const segments: string[] = [];
  for (let i = 0; i < params.questions.length; i++) {
    const a = result.answers.find((x) => x.questionIndex === i);
    if (a) segments.push(buildAnswerSegment(a));
  }

  if (segments.length === 0) {
    return buildToolResult(DECLINE_MESSAGE, { answers: result.answers, cancelled: true });
  }

  return buildToolResult(`${ENVELOPE_PREFIX} ${segments.join(" ")} ${ENVELOPE_SUFFIX}`, result);
}
