import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { findLastUserMessageEntry } from "./back";

function asEntries(entries: unknown[]): SessionEntry[] {
  return entries as SessionEntry[];
}

describe("findLastUserMessageEntry", () => {
  it("returns undefined for empty branch", () => {
    expect(findLastUserMessageEntry([])).toBeUndefined();
  });

  it("returns undefined when no user message exists", () => {
    const branch = asEntries([
      {
        type: "message",
        id: "a",
        message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
      },
      {
        type: "toolResult",
        id: "b",
        toolCallId: "x",
        toolName: "x",
        content: [{ type: "text", text: "r" }],
      },
      { type: "custom", id: "c", customType: "x", data: {} },
    ]);
    expect(findLastUserMessageEntry(branch)).toBeUndefined();
  });

  it("finds the last user message", () => {
    const branch = asEntries([
      { type: "message", id: "a", message: { role: "user", content: "first" } },
      {
        type: "message",
        id: "b",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
      },
      {
        type: "message",
        id: "c",
        message: { role: "user", content: "second" },
      },
    ]);
    const result = findLastUserMessageEntry(branch);
    expect(result).toBeDefined();
    expect(result?.id).toBe("c");
    expect(result?.message.content).toBe("second");
  });

  it("finds user message in the middle", () => {
    const branch = asEntries([
      { type: "message", id: "a", message: { role: "user", content: "only" } },
      {
        type: "message",
        id: "b",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "reply" }],
        },
      },
      { type: "modelChange", id: "c", model: "m" },
    ]);
    const result = findLastUserMessageEntry(branch);
    expect(result).toBeDefined();
    expect(result?.id).toBe("a");
  });

  it("finds user message as first entry", () => {
    const branch = asEntries([
      { type: "message", id: "a", message: { role: "user", content: "hello" } },
    ]);
    const result = findLastUserMessageEntry(branch);
    expect(result).toBeDefined();
    expect(result?.id).toBe("a");
  });

  it("ignores custom_message entries", () => {
    const branch = asEntries([
      { type: "message", id: "a", message: { role: "user", content: "real" } },
      {
        type: "custom_message",
        id: "b",
        customType: "x",
        content: "injected",
        display: false,
      },
    ]);
    const result = findLastUserMessageEntry(branch);
    expect(result).toBeDefined();
    expect(result?.id).toBe("a");
  });
});
