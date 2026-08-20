import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { normalizeSessionTitle } from "./session-name";

const TITLE_PROVIDER = "deepseek";
const TITLE_MODEL = "deepseek-v4-flash";
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

/** Request and validate one title from the configured lightweight model. */
export async function requestSessionTitle(
  prompt: string,
  ctx: ExtensionContext,
): Promise<string | null> {
  try {
    const model = ctx.modelRegistry.find(TITLE_PROVIDER, TITLE_MODEL);
    if (!model) return null;

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

    return normalizeSessionTitle(getAssistantText(response.content));
  } catch {
    return null;
  }
}
