import { describe, it, expect } from "vitest";
import { classifyEvent, EVENT_IMPACTS } from "./events";
import type { EventMagnitude } from "./types";

describe("EVENT_IMPACTS", () => {
  it("maps each magnitude to non-empty impact", () => {
    const magnitudes: EventMagnitude[] = [
      "positive-small",
      "positive-large",
      "negative-small",
      "negative-large",
    ];
    for (const m of magnitudes) {
      const impact = EVENT_IMPACTS[m];
      expect(impact).toBeDefined();
      expect(Object.values(impact).some((v) => v !== 0)).toBe(true);
    }
  });
});

describe("classifyEvent", () => {
  it("returns positive-small for test success tool result", () => {
    expect(classifyEvent("tool_result", { test: { passed: true } })).toBe(
      "positive-small",
    );
  });

  it("returns positive-large for build/deploy success", () => {
    expect(
      classifyEvent("tool_result", { build: { status: "success" } }),
    ).toBe("positive-large");
    expect(
      classifyEvent("tool_result", { deploy: { status: "success" } }),
    ).toBe("positive-large");
  });

  it("returns negative-small for test/lint failure", () => {
    expect(classifyEvent("tool_result", { test: { passed: false } })).toBe(
      "negative-small",
    );
    expect(classifyEvent("tool_result", { lint: { errors: 3 } })).toBe(
      "negative-small",
    );
  });

  it("returns negative-large for build failure", () => {
    expect(
      classifyEvent("tool_result", { build: { status: "failure" } }),
    ).toBe("negative-large");
  });

  it("returns positive-small for git push", () => {
    expect(classifyEvent("git_push", {})).toBe("positive-small");
  });

  it("returns negative-small for agent or tool errors", () => {
    expect(classifyEvent("agent_error", {})).toBe("negative-small");
    expect(classifyEvent("tool_error", {})).toBe("negative-small");
  });

  it("returns null for lint with no errors", () => {
    expect(classifyEvent("tool_result", { lint: {} })).toBeNull();
  });

  it("returns negative-large for failed deploy", () => {
    expect(
      classifyEvent("tool_result", { deploy: { status: "failure" } }),
    ).toBe("negative-large");
  });

  it("returns null for unknown events", () => {
    expect(classifyEvent("unknown_event", {})).toBeNull();
    expect(classifyEvent("tool_result", { unknown: {} })).toBeNull();
  });
});
