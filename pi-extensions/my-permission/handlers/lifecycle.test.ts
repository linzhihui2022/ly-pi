import { describe, expect, it } from "vitest";
import { createLifecycleHandler, type LifecycleDependencies } from "./lifecycle.js";

function makeDeps(overrides: Partial<LifecycleDependencies> = {}): LifecycleDependencies {
  const rules: any[] = [];
  return {
    loadConfig: () => ({
      default: "ask", external: "ask", log: { debug: false, review: true },
      tools: {}, bash: {}, paths: {}, skills: {},
    }),
    sessionState: {
      yolo: false, yoloAllSub: false, sessionRules: rules,
      toggleYolo: () => {}, toggleYoloAllSub: () => {},
      addSessionRule: (r) => rules.push(r),
      restoreSessionRules: (rs) => { rules.length = 0; rules.push(...rs); },
      findSessionRule: () => undefined,
      forEachSessionRuleEntry: (cb) => rules.forEach(cb),
      clear: () => { rules.length = 0; },
    },
    logger: { logReview: () => {}, logDebug: () => {}, setDebugEnabled: () => {}, flush: () => {} },
    subagentPolicy: {
      getDefaultPolicy: () => "inherit-parent", writePolicySnapshot: () => "/tmp/s.json",
      readPolicySnapshot: () => undefined, deletePolicySnapshot: () => {}, isSubagentProcess: () => false,
    },
    ...overrides,
  };
}

describe("handleSessionStart", () => {
  it("sets debug enabled when log.debug is true", () => {
    let debugEnabled = false;
    const deps = makeDeps({
      loadConfig: () => ({ default: "ask", external: "ask", log: { debug: true, review: true }, tools: {}, bash: {}, paths: {}, skills: {} }),
      logger: { ...makeDeps().logger, setDebugEnabled: (v) => { debugEnabled = v; } },
    });
    createLifecycleHandler(deps).handleSessionStart({ type: "session_start", reason: "startup" } as any, {} as any);
    expect(debugEnabled).toBe(true);
  });

  it("restores session rules on reload", () => {
    const sessionManager = {
      getEntries: () => [
        { type: "custom", customType: "my-permission:session-rule", data: { surface: "tools", pattern: "bash", action: "allow" } },
        { type: "custom", customType: "my-permission:session-rule", data: { surface: "paths", pattern: "*.env", action: "deny" } },
      ],
    };
    const deps = makeDeps();
    createLifecycleHandler(deps).handleSessionStart({ type: "session_start", reason: "reload" } as any, { sessionManager } as any);
    expect(deps.sessionState.sessionRules).toEqual([
      { surface: "tools", pattern: "bash", action: "allow" },
      { surface: "paths", pattern: "*.env", action: "deny" },
    ]);
  });

  it("handles reload with empty entries", () => {
    const sm = { getEntries: () => [] };
    const deps = makeDeps();
    expect(() => createLifecycleHandler(deps).handleSessionStart({ type: "session_start", reason: "reload" } as any, { sessionManager: sm } as any)).not.toThrow();
  });

  it("handles reload with no matching custom entries", () => {
    const sm = { getEntries: () => [{ type: "custom", customType: "other", data: {} }] };
    const deps = makeDeps();
    expect(() => createLifecycleHandler(deps).handleSessionStart({ type: "session_start", reason: "reload" } as any, { sessionManager: sm } as any)).not.toThrow();
  });

  it("does not restore session rules on normal startup", () => {
    const sm = { getEntries: () => [{ type: "custom", customType: "my-permission:session-rule", data: { surface: "tools", pattern: "bash", action: "allow" } }] };
    const deps = makeDeps();
    createLifecycleHandler(deps).handleSessionStart({ type: "session_start", reason: "startup" } as any, { sessionManager: sm } as any);
    expect(deps.sessionState.sessionRules).toEqual([]);
  });
});

describe("handleSessionShutdown", () => {
  it("flushes logs", () => {
    let flushed = false;
    const deps = makeDeps({ logger: { ...makeDeps().logger, flush: () => { flushed = true; } } });
    createLifecycleHandler(deps).handleSessionShutdown({ type: "session_shutdown", reason: "quit" } as any, {} as any);
    expect(flushed).toBe(true);
  });
});
