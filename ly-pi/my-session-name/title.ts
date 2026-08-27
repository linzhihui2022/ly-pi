import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { normalizeSessionTitle } from "./session-name";

const TITLE_MODEL = {
  provider: "openai-codex",
  id: "gpt-5.6-luna",
} as const;
const TITLE_SYSTEM_PROMPT =
  "Generate a concise session display name from the user request. " +
  "Use the request's language. Return only one short line, at most 20 characters, with no explanation.";

function getAssistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

/** Request and validate one title through the Luna Direct Model Binding. */
export async function requestSessionTitle(
  prompt: string,
  ctx: ExtensionContext,
): Promise<string | null> {
  const model = ctx.modelRegistry.find(TITLE_MODEL.provider, TITLE_MODEL.id);
  if (!model) return null;

  try {
    const response = await ctx.modelRegistry.complete(
      model,
      {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
            timestamp: Date.now(),
          },
        ],
      },
      {
        maxRetries: 0,
        maxTokens: 32,
        timeoutMs: 10_000,
      },
    );
    if (response.stopReason === "error" || response.errorMessage) return null;
    return normalizeSessionTitle(getAssistantText(response.content));
  } catch {
    return null;
  }
}
