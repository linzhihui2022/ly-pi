import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { Category, GeneratedCharacter } from "./types";
import { formatGenerationPrompt, parseCharacter } from "./format";

export type CompleteSimpleFn = typeof completeSimple;

export async function generateCharacter(
  category: Category,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<GeneratedCharacter | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatGenerationPrompt(category);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  const parsed = parseCharacter(text);
  if (!parsed) {
    return { error: "generation_failed" };
  }

  return parsed;
}
