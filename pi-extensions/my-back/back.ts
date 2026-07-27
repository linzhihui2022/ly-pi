import type { UserMessage } from "@earendil-works/pi-ai";
import type {
  SessionEntry,
  SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";

export type UserMessageEntry = SessionMessageEntry & {
  message: UserMessage;
};

export function findLastUserMessageEntry(
  branch: SessionEntry[],
): UserMessageEntry | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "message" && entry.message.role === "user") {
      return entry as UserMessageEntry;
    }
  }
  return undefined;
}
