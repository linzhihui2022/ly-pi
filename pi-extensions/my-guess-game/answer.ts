import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState, YesNoUnknown } from "./types";
import { formatAnswerPrompt, normalizeYesNoUnknown } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function answerQuestion(
  state: GameState,
  question: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<YesNoUnknown | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatAnswerPrompt(state.target, state.summary, question);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  return normalizeYesNoUnknown(text) ?? "Unknown";
}
