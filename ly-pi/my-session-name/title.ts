import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadModelPolicyRegistry } from "../model-policy/config";
import { normalizeSessionTitle } from "./session-name";

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions", "ly-pi");
type TitleModelPolicyRegistry = Pick<
  ReturnType<typeof loadModelPolicyRegistry>,
  "run"
>;
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

/** Request and validate one title through the fast Model Role. */
export async function requestSessionTitle(
  prompt: string,
  ctx: ExtensionContext,
  registry?: TitleModelPolicyRegistry,
): Promise<string | null> {
  try {
    const result = await (registry ?? loadModelPolicyRegistry(EXT_DIR)).run(
      "fast",
      ctx.modelRegistry,
      async (model) =>
        ctx.modelRegistry.complete(
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
        ),
    );
    if (result.status !== "success") return null;

    return normalizeSessionTitle(getAssistantText(result.value.content));
  } catch {
    return null;
  }
}
