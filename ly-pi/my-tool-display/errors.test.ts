import { describe, expect, it, vi } from "vitest";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("./logger", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError },
}));

import {
  describeError,
  getErrorCode,
  logUnexpectedPreviewError,
  serializeError,
  withErrorDetails,
} from "./errors";

describe("getErrorCode", () => {
  it("returns undefined for non-objects", () => {
    expect(getErrorCode("ENOENT")).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode(undefined)).toBeUndefined();
    expect(getErrorCode(42)).toBeUndefined();
  });

  it("returns the code of error-like objects", () => {
    const error = Object.assign(new Error("x"), { code: "ENOENT" });
    expect(getErrorCode(error)).toBe("ENOENT");
  });

  it("ignores non-string codes", () => {
    expect(getErrorCode({ code: 42 })).toBeUndefined();
    expect(getErrorCode({})).toBeUndefined();
  });
});

describe("serializeError", () => {
  it("expands Error instances", () => {
    const error = new Error("boom");
    expect(serializeError(error)).toEqual({
      name: "Error",
      message: "boom",
      stack: error.stack,
    });
  });

  it("passes non-Error values through unchanged", () => {
    expect(serializeError("boom")).toBe("boom");
    expect(serializeError({ code: "ENOENT" })).toEqual({ code: "ENOENT" });
  });
});

describe("describeError", () => {
  it("prefixes the code for errors that carry one", () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    expect(describeError(error)).toBe("EACCES: permission denied");
  });

  it("falls back to the error name when the message is empty", () => {
    expect(describeError(new Error(""))).toBe("Error");
  });

  it("returns plain strings unchanged", () => {
    expect(describeError("plain failure")).toBe("plain failure");
  });

  it("returns the bare code for non-Error objects", () => {
    expect(describeError({ code: "ENOENT" })).toBe("ENOENT");
  });

  it("returns undefined when nothing can be described", () => {
    expect(describeError(42)).toBeUndefined();
  });
});

describe("withErrorDetails", () => {
  it("appends the described error", () => {
    expect(withErrorDetails("Write diff unavailable", new Error("boom"))).toBe(
      "Write diff unavailable (boom)",
    );
  });

  it("sanitizes control characters in the described error", () => {
    expect(withErrorDetails("reason", "\u001b[31mred\u001b[0m")).toBe(
      "reason (red)",
    );
  });

  it("keeps the bare reason when the error cannot be described", () => {
    expect(withErrorDetails("Write diff unavailable", 42)).toBe(
      "Write diff unavailable",
    );
  });
});

describe("logUnexpectedPreviewError", () => {
  it("stays silent for expected error codes", () => {
    logError.mockClear();
    const expected = Object.assign(new Error("missing"), { code: "ENOENT" });

    logUnexpectedPreviewError("msg", expected);

    expect(logError).not.toHaveBeenCalled();
  });

  it("logs unexpected errors with serialized details", () => {
    logError.mockClear();
    const error = new Error("boom");

    logUnexpectedPreviewError("msg", error);

    expect(logError).toHaveBeenCalledWith("msg", {
      error: { name: "Error", message: "boom", stack: error.stack },
    });
  });
});
