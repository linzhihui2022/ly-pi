import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  buildForkSessionName,
  getFirstUserPrompt,
  hasSessionNameAttempt,
  normalizeSessionTitle,
  SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
  shortSessionHash,
} from "./session-name";

describe("normalizeSessionTitle", () => {
  it("trims whitespace and removes wrapping quotes", () => {
    expect(normalizeSessionTitle('  "修复登录流程"  ')).toBe("修复登录流程");
    expect(normalizeSessionTitle("'修复登录流程'")).toBe("修复登录流程");
    expect(normalizeSessionTitle("`修复登录流程`")).toBe("修复登录流程");
    expect(normalizeSessionTitle("修复登录流程")).toBe("修复登录流程");
  });

  it("rejects empty, multiline, control-character, and overlong titles", () => {
    expect(normalizeSessionTitle("   ")).toBeNull();
    expect(normalizeSessionTitle("第一行\n第二行")).toBeNull();
    expect(normalizeSessionTitle("\n标题")).toBeNull();
    expect(normalizeSessionTitle("标题\n")).toBeNull();
    expect(normalizeSessionTitle('"标题\n"')).toBeNull();
    expect(normalizeSessionTitle("标题\u0000")).toBeNull();
    expect(normalizeSessionTitle("第一行\u2028第二行")).toBeNull();
    expect(normalizeSessionTitle("\u2028标题")).toBeNull();
    expect(normalizeSessionTitle("标题\u2029第二行")).toBeNull();
    expect(
      normalizeSessionTitle("一二三四五六七八九十一二三四五六七八九十一"),
    ).toBeNull();
  });
});

function asEntries(entries: unknown[]): SessionEntry[] {
  return entries as SessionEntry[];
}

describe("session fork naming", () => {
  it("derives a stable six-character lowercase hash from the child session id", () => {
    expect(shortSessionHash("child-session-1")).toBe("79a3a1");
  });

  it("appends the hash to the base display name", () => {
    expect(buildForkSessionName("修复登录流程", "child-session-1")).toBe(
      "修复登录流程-79a3a1",
    );
  });

  it("preserves a long manual base name when adding the hash", () => {
    expect(
      buildForkSessionName("这是用户设置的超长手动名称", "child-session-1"),
    ).toBe("这是用户设置的超长手动名称-79a3a1");
  });
});

describe("hasSessionNameAttempt", () => {
  it("matches only an attempt marker for the current session", () => {
    expect(
      hasSessionNameAttempt(
        asEntries([
          {
            type: "custom",
            customType: SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
            data: { sessionId: "other-session" },
          },
          {
            type: "custom",
            customType: SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
            data: { sessionId: "current-session" },
          },
        ]),
        "current-session",
      ),
    ).toBe(true);
  });

  it("returns false when no matching marker exists", () => {
    expect(
      hasSessionNameAttempt(
        asEntries([
          {
            type: "custom",
            customType: "other-extension",
            data: { sessionId: "current-session" },
          },
        ]),
        "current-session",
      ),
    ).toBe(false);
  });
});

describe("getFirstUserPrompt", () => {
  it("returns the first textual user message and removes skill blocks", () => {
    expect(
      getFirstUserPrompt(
        asEntries([
          { type: "message", message: { role: "assistant" } },
          {
            type: "message",
            message: {
              role: "user",
              content: '<skill name="demo">expanded skill</skill> 修复登录',
            },
          },
          {
            type: "message",
            message: { role: "user", content: "后续问题" },
          },
        ]),
      ),
    ).toBe("修复登录");
  });

  it("reads text content parts", () => {
    expect(
      getFirstUserPrompt(
        asEntries([
          {
            type: "message",
            message: {
              role: "user",
              content: [
                { type: "text", text: "研究 " },
                { type: "image", data: "x" },
              ],
            },
          },
        ]),
      ),
    ).toBe("研究");
  });

  it("returns null when no user text exists", () => {
    expect(
      getFirstUserPrompt(
        asEntries([
          { type: "message", message: { role: "user", content: "   " } },
          {
            type: "message",
            message: { role: "user", content: [{ type: "image", data: "x" }] },
          },
        ]),
      ),
    ).toBeNull();
  });
});
