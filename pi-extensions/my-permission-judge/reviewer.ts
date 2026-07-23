import { complete, getModel } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { JudgePrompt } from "./types";

const PROVIDER = "deepseek";
const MODEL_ID = "deepseek-v4-flash";
const TIMEOUT_MS = 20_000;

export type GetCtxFn = () => ExtensionContext | undefined;

export function createReviewer(
  getCtx: GetCtxFn,
): (prompt: JudgePrompt) => Promise<string> {
  return async function review(prompt: JudgePrompt): Promise<string> {
    const ctx = getCtx();
    if (!ctx) {
      throw new Error("Session not started");
    }

    const model = getModel(PROVIDER, MODEL_ID);
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      throw new Error(auth.error ?? "No API key configured for review model");
    }

    const response = await complete(
      model,
      {
        systemPrompt: prompt.system,
        messages: [
          {
            role: "user",
            content: prompt.user,
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    return response.content
      .filter(
        (block): block is { type: "text"; text: string } =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");
  };
}
