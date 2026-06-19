import { describe, expect, it } from "vitest";
import {
  createSessionState,
  type SessionRule,
  type SessionState,
} from "./session-state.js";

function collectEntries(state: SessionState): SessionRule[] {
  const entries: SessionRule[] = [];
  state.forEachSessionRuleEntry((rule) => entries.push(rule));
  return entries;
}

describe("createSessionState", () => {
  it("initializes with yolo and yoloAllSub disabled", () => {
    const state = createSessionState();
    expect(state.yolo).toBe(false);
    expect(state.yoloAllSub).toBe(false);
  });

  it("starts with no session rules", () => {
    const state = createSessionState();
    expect(collectEntries(state)).toEqual([]);
  });
});

describe("toggleYolo", () => {
  it("toggles yolo from false to true", () => {
    const state = createSessionState();
    state.toggleYolo();
    expect(state.yolo).toBe(true);
  });

  it("toggles yolo back to false", () => {
    const state = createSessionState();
    state.toggleYolo();
    state.toggleYolo();
    expect(state.yolo).toBe(false);
  });
});

describe("toggleYoloAllSub", () => {
  it("toggles yoloAllSub from false to true", () => {
    const state = createSessionState();
    state.toggleYoloAllSub();
    expect(state.yoloAllSub).toBe(true);
  });

  it("toggles yoloAllSub back to false", () => {
    const state = createSessionState();
    state.toggleYoloAllSub();
    state.toggleYoloAllSub();
    expect(state.yoloAllSub).toBe(false);
  });
});

describe("addSessionRule", () => {
  it("adds a rule to the in-memory list", () => {
    const state = createSessionState();
    const rule: SessionRule = { surface: "tools", pattern: "bash", action: "deny" };
    state.addSessionRule(rule);
    expect(collectEntries(state)).toEqual([rule]);
  });

  it("invokes the onAppend callback when provided", () => {
    const state = createSessionState();
    const appended: SessionRule[] = [];
    state.onAppend = (rule) => appended.push(rule);

    const rule: SessionRule = { surface: "paths", pattern: "*.env", action: "deny" };
    state.addSessionRule(rule);

    expect(appended).toEqual([rule]);
  });
});

describe("restoreSessionRules", () => {
  it("replaces current rules with the provided rules", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "deny" });

    const restored: SessionRule[] = [
      { surface: "paths", pattern: "*.env", action: "deny" },
    ];
    state.restoreSessionRules(restored);

    expect(collectEntries(state)).toEqual(restored);
  });
});

describe("findSessionRule", () => {
  it("returns undefined when there are no rules", () => {
    const state = createSessionState();
    expect(state.findSessionRule("tools", "bash")).toBeUndefined();
  });

  it("returns a matching allow rule", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "allow" });
    const found = state.findSessionRule("tools", "bash");
    expect(found).toEqual({ surface: "tools", pattern: "bash", action: "allow" });
  });

  it("returns a matching deny rule", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "bash", pattern: "rm -rf *", action: "deny" });
    const found = state.findSessionRule("bash", "rm -rf *");
    expect(found).toEqual({ surface: "bash", pattern: "rm -rf *", action: "deny" });
  });

  it("returns undefined for non-matching surface", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "allow" });
    expect(state.findSessionRule("bash", "bash")).toBeUndefined();
  });

  it("returns undefined for non-matching pattern", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "allow" });
    expect(state.findSessionRule("tools", "read")).toBeUndefined();
  });

  it("returns the last matching rule when multiple match", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "allow" });
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "deny" });
    const found = state.findSessionRule("tools", "bash");
    expect(found?.action).toBe("deny");
  });
});

describe("clear", () => {
  it("removes all session rules", () => {
    const state = createSessionState();
    state.addSessionRule({ surface: "tools", pattern: "bash", action: "deny" });
    state.clear();
    expect(collectEntries(state)).toEqual([]);
  });
});
