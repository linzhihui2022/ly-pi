import type { ImageAssetConversationMessage } from "./contract";

interface SessionMessageEntry {
  readonly type?: unknown;
  readonly message?: {
    readonly role?: unknown;
    readonly content?: unknown;
  };
  readonly content?: unknown;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }
      return "";
    })
    .join("");
}

export function readImageAssetConversation(
  entries: readonly unknown[],
): ImageAssetConversationMessage[] {
  return entries.flatMap((entry) => {
    const sessionEntry = entry as SessionMessageEntry;
    const role = sessionEntry.message?.role;
    if (
      sessionEntry.type !== "message" ||
      (role !== "user" && role !== "assistant")
    ) {
      return [];
    }
    return [
      {
        role,
        text: textFromContent(
          sessionEntry.message?.content ?? sessionEntry.content,
        ),
      },
    ];
  });
}
