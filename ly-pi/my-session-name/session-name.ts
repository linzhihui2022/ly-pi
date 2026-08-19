import { createHash } from "node:crypto";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export const MAX_SESSION_TITLE_LENGTH = 20;
export const SESSION_NAME_ATTEMPT_CUSTOM_TYPE = "my-session-name-attempt";

function stripSkillBlocks(text: string): string {
  return text.replace(/<skill[^>]*>[\s\S]*?<\/skill>/g, "").trim();
}

function getUserMessageText(entry: SessionEntry): string | null {
  if (entry.type !== "message" || entry.message?.role !== "user") {
    return null;
  }

  const content = entry.message.content;
  if (typeof content === "string") {
    const text = stripSkillBlocks(content);
    return text || null;
  }

  if (!Array.isArray(content)) return null;

  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const value = (part as { text?: unknown }).text;
        return typeof value === "string" ? value : "";
      }
      return "";
    })
    .join(" ");
  const stripped = stripSkillBlocks(text);
  return stripped || null;
}

/** Return whether this session already recorded a title attempt. */
export function hasSessionNameAttempt(
  entries: SessionEntry[],
  sessionId: string,
): boolean {
  return entries.some((entry) => {
    if (
      entry.type !== "custom" ||
      entry.customType !== SESSION_NAME_ATTEMPT_CUSTOM_TYPE
    ) {
      return false;
    }
    const data = entry.data;
    return (
      typeof data === "object" &&
      data !== null &&
      "sessionId" in data &&
      data.sessionId === sessionId
    );
  });
}

/** Extract the first textual user prompt from a session branch. */
export function getFirstUserPrompt(entries: SessionEntry[]): string | null {
  for (const entry of entries) {
    const text = getUserMessageText(entry);
    if (text) return text;
  }
  return null;
}

/** Derive the stable short identifier used in fork display names. */
export function shortSessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 6);
}

/** Build a fork display name from its base name and child session id. */
export function buildForkSessionName(
  baseName: string,
  childSessionId: string,
): string {
  return `${baseName}-${shortSessionHash(childSessionId)}`;
}

/** Normalize an LLM response into a safe, short session display name. */
export function normalizeSessionTitle(value: string): string | null {
  if (/[\p{Cc}\u2028\u2029]/u.test(value)) return null;

  const trimmed = value.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`")))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  if (!unquoted || unquoted.length > MAX_SESSION_TITLE_LENGTH) {
    return null;
  }

  return unquoted;
}
