import { describe, expect, it } from "vitest";
import {
  canRoundTripUtf8,
  getWriteDiffDetails,
  hasVisibleOutput,
  isRecord,
  sanitizeToolCallArgs,
  sanitizeToolLabel,
  sanitizeToolOutput,
  textOutput,
} from "./sanitize";

describe("canRoundTripUtf8", () => {
  it("accepts valid UTF-8 text", () => {
    expect(canRoundTripUtf8("héllo → 世界 🚀")).toBe(true);
    expect(canRoundTripUtf8("")).toBe(true);
  });

  it("rejects lone surrogates that cannot round-trip", () => {
    expect(canRoundTripUtf8("a\ud800b")).toBe(false);
  });
});

describe("sanitizeToolOutput", () => {
  it("strips ANSI sequences", () => {
    expect(sanitizeToolOutput("\u001b[31mred\u001b[0m plain")).toBe(
      "red plain",
    );
  });

  it("keeps tabs and newlines but drops carriage returns", () => {
    expect(sanitizeToolOutput("a\tb\nc\rd")).toBe("a\tb\ncd");
  });

  it("drops C1 control characters and format characters", () => {
    expect(sanitizeToolOutput("a\u009fb\u200bc")).toBe("abc");
  });

  it("keeps ordinary and astral characters", () => {
    expect(sanitizeToolOutput("ok 🚀 世界")).toBe("ok 🚀 世界");
  });

  it("drops the non-character range U+FFF9..U+FFFB", () => {
    expect(sanitizeToolOutput("a\ufff9b\ufffbc")).toBe("abc");
  });
});

describe("sanitizeToolLabel", () => {
  it("passes strings through sanitization", () => {
    expect(sanitizeToolLabel("path/to\u001b[31mfile")).toBe("path/tofile");
  });

  it("flattens newlines into spaces", () => {
    expect(sanitizeToolLabel("line1\nline2\u2028line3")).toBe(
      "line1 line2 line3",
    );
  });

  it("renders nullish labels as an ellipsis", () => {
    expect(sanitizeToolLabel(null)).toBe("...");
    expect(sanitizeToolLabel(undefined)).toBe("...");
  });

  it("stringifies non-string labels", () => {
    expect(sanitizeToolLabel(42)).toBe("42");
  });
});

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("str")).toBe(false);
  });
});

describe("sanitizeToolCallArgs", () => {
  it("returns non-record arguments unchanged", () => {
    expect(sanitizeToolCallArgs("raw")).toBe("raw");
    expect(sanitizeToolCallArgs(null)).toBeNull();
  });

  it("sanitizes string values and keeps other values", () => {
    expect(
      sanitizeToolCallArgs({
        path: "a\u001b[31mb",
        count: 5,
        nested: { keep: true },
      }),
    ).toEqual({ path: "ab", count: 5, nested: { keep: true } });
  });
});

describe("getWriteDiffDetails", () => {
  it("returns undefined for non-records and missing writeDiff", () => {
    expect(getWriteDiffDetails("raw")).toBeUndefined();
    expect(getWriteDiffDetails({})).toBeUndefined();
  });

  it("rejects a non-object writeDiff", () => {
    expect(getWriteDiffDetails({ writeDiff: "diff" })).toBeUndefined();
    expect(getWriteDiffDetails({ writeDiff: null })).toBeUndefined();
  });

  it("reads diff details", () => {
    expect(
      getWriteDiffDetails({ writeDiff: { kind: "diff", diff: "@@ -1 +1 @@" } }),
    ).toEqual({ kind: "diff", diff: "@@ -1 +1 @@" });
  });

  it("reads summary details", () => {
    expect(
      getWriteDiffDetails({
        writeDiff: { kind: "summary", summary: "no changes" },
      }),
    ).toEqual({ kind: "summary", summary: "no changes" });
  });

  it("returns undefined for unknown kinds and malformed payloads", () => {
    expect(
      getWriteDiffDetails({ writeDiff: { kind: "other" } }),
    ).toBeUndefined();
    expect(
      getWriteDiffDetails({ writeDiff: { kind: "diff" } }),
    ).toBeUndefined();
    expect(
      getWriteDiffDetails({ writeDiff: { kind: "summary", summary: 7 } }),
    ).toBeUndefined();
  });
});

describe("textOutput", () => {
  it("joins sanitized text parts with newlines", () => {
    expect(
      textOutput({
        content: [
          { type: "text", text: "a\u001b[31mb" },
          { type: "image" },
          { type: "text", text: "c" },
        ],
      }),
    ).toBe("ab\nc");
  });

  it("treats missing text as empty", () => {
    expect(textOutput({ content: [{ type: "text" }] })).toBe("");
  });
});

describe("hasVisibleOutput", () => {
  it("ignores whitespace-only output", () => {
    expect(hasVisibleOutput("  \n\t ")).toBe(false);
    expect(hasVisibleOutput("x")).toBe(true);
  });
});
