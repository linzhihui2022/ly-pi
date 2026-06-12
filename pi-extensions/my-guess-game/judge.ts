import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState } from "./types";
import { formatJudgementPrompt, normalizeJudgement } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function judgeGuess(
  state: GameState,
  guess: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<boolean | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatJudgementPrompt(state.target, state.summary, guess);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  const judgement = normalizeJudgement(text);
  if (judgement === undefined) {
    return { error: "ambiguous_guess" };
  }

  return judgement === "correct";
}
