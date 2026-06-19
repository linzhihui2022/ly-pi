import { describe, expect, it } from "vitest";
import type { ToolCallEvent } from "@earendil-works/pi-coding-agent";
import type { MergedConfig } from "../config.js";
import type { CheckResult } from "../checker.js";
import {
  createToolCallHandler,
  type ToolCallDependencies,
} from "./tool-call.js";

function makeConfig(overrides: Partial<MergedConfig> = {}): MergedConfig {
  return {
    default: "ask",
    external: "ask",
    log: { debug: false, review: true },
    tools: {},
    bash: {},
    paths: {},
    skills: {},
    ...overrides,
  };
}

function makeSessionState(overrides: Partial<any> = {}) {
  const rules: any[] = [];
  let yolo = overrides.yolo ?? false;
  let yoloAllSub = overrides.yoloAllSub ?? false;
  return {
    get yolo() {
      return yolo;
    },
    get yoloAllSub() {
      return yoloAllSub;
    },
    sessionRules: rules,
    toggleYolo: () => {
      yolo = !yolo;
    },
    toggleYoloAllSub: () => {
      yoloAllSub = !yoloAllSub;
    },
    addSessionRule: (rule: any) => rules.push(rule),
    restoreSessionRules: (rs: any[]) => {
      rules.length = 0;
      rules.push(...rs);
    },
    findSessionRule: (surface: string, pattern: string) =>
      rules.find((r) => r.surface === surface && r.pattern === pattern),
    forEachSessionRuleEntry: (cb: (rule: any) => void) => rules.forEach(cb),
    clear: () => {
      rules.length = 0;
    },
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<ToolCallDependencies> = {},
): ToolCallDependencies {
  const config = makeConfig(overrides.configOverrides ?? {});
  const sessionState = makeSessionState(overrides.sessionOverrides ?? {});

  const reviewEntries: any[] = [];
  const debugEntries: any[] = [];

  return {
    loadConfig: () => config,
    sessionState,
    checkerFactory: (cfg, state) => ({
      check: (input) => {
        const toolAction = cfg.tools[input.toolName];
        if (toolAction) {
          return {
            state: toolAction,
            origin: "global",
            surface: "tools",
            value: input.toolName,
            matchedPattern: input.toolName,
          };
        }
        const result: CheckResult = {
          state: cfg.default,
          origin: "default",
          surface: "tools",
          value: input.toolName,
          matchedPattern: "*",
        };
        if (state.yolo && result.state === "ask") {
          return { ...result, state: "allow", origin: "yolo" };
        }
        return result;
      },
    }),
    dialog: async () => ({ kind: "allow-once" }),
    logger: {
      logReview: (entry) => reviewEntries.push(entry),
      logDebug: (entry) => debugEntries.push(entry),
      setDebugEnabled: () => {},
      flush: () => {},
    },
    subagentPolicy: {
      getDefaultPolicy: (yoloAllSub) =>
        yoloAllSub ? "yolo" : "inherit-parent",
      writePolicySnapshot: () => "/tmp/snapshot.json",
      readPolicySnapshot: () => undefined,
      deletePolicySnapshot: () => {},
      isSubagentProcess: () => false,
    },
    reviewEntries,
    debugEntries,
    ...overrides,
  };
}

function makeEvent(toolName: string, input: any): ToolCallEvent {
  return {
    type: "tool_call",
    toolName: toolName as any,
    toolCallId: "tc-1",
    input,
  } as ToolCallEvent;
}

function makeCtx(hasUI = true, env: Record<string, string> = {}) {
  return {
    hasUI,
    ui: {
      notify: () => {},
      select: async () => undefined,
    },
    cwd: "/project",
    sessionManager: { getSessionId: () => "test-session-id" },
  } as any;
}

describe("createToolCallHandler", () => {
  it("allows a skill load when configured as allow", async () => {
    const deps = makeDeps({
      configOverrides: { skills: { "my-skill": "allow" } },
      checkerFactory: (cfg) => ({
        check: (input) => {
          if (input.skillName && cfg.skills[input.skillName]) {
            return {
              state: cfg.skills[input.skillName],
              origin: "global",
              surface: "skills",
              value: input.skillName,
              matchedPattern: input.skillName,
            };
          }
          return {
            state: "ask",
            origin: "default",
            surface: "skills",
            value: "*",
            matchedPattern: "*",
          };
        },
      }),
    });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("load_skill", { skillName: "my-skill" }),
      makeCtx(),
    );
    expect(result).toBeUndefined();
    expect(deps.reviewEntries[0].state).toBe("allow");
  });

  it("allows a tool configured as allow without prompting", async () => {
    const deps = makeDeps({ configOverrides: { tools: { read: "allow" } } });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("read", { path: "file.txt" }),
      makeCtx(),
    );
    expect(result).toBeUndefined();
    expect(deps.reviewEntries).toHaveLength(1);
    expect(deps.reviewEntries[0].state).toBe("allow");
  });

  it("blocks a tool configured as deny", async () => {
    const deps = makeDeps({ configOverrides: { tools: { bash: "deny" } } });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "bash"',
    });
    expect(deps.reviewEntries[0].state).toBe("deny");
  });

  it("prompts for an ask decision and allows once", async () => {
    const deps = makeDeps({ dialog: async () => ({ kind: "allow-once" }) });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toBeUndefined();
    expect(deps.reviewEntries[0].state).toBe("allow");
  });

  it("prompts for an ask decision and denies", async () => {
    const deps = makeDeps({ dialog: async () => ({ kind: "deny" }) });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "bash"',
    });
  });

  it("prompts for an ask decision and denies with reason", async () => {
    const deps = makeDeps({
      dialog: async () => ({ kind: "deny-with-reason", reason: "sensitive" }),
    });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "bash"',
    });
  });

  it("adds a session rule on allow-session", async () => {
    const deps = makeDeps({ dialog: async () => ({ kind: "allow-session" }) });
    const handler = createToolCallHandler(deps);
    await handler(makeEvent("bash", { command: "date" }), makeCtx());
    expect(deps.sessionState.findSessionRule("tools", "bash")).toEqual({
      surface: "tools",
      pattern: "bash",
      action: "allow",
    });
  });

  it("writes a project rule on allow-project", async () => {
    const projectRules: any[] = [];
    const deps = makeDeps({
      dialog: async () => ({ kind: "allow-project" }),
      saveProjectRule: (cwd, surface, pattern) =>
        projectRules.push({ cwd, surface, pattern }),
    });
    const handler = createToolCallHandler(deps);
    await handler(makeEvent("bash", { command: "date" }), makeCtx());
    expect(projectRules).toEqual([
      { cwd: "/project", surface: "tools", pattern: "bash" },
    ]);
  });

  it("auto-allows when yolo is enabled", async () => {
    const deps = makeDeps({ sessionOverrides: { yolo: true } });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toBeUndefined();
    expect(deps.reviewEntries[0].origin).toBe("yolo");
  });

  it("does not auto-allow deny rules when yolo is enabled", async () => {
    const deps = makeDeps({
      configOverrides: { tools: { bash: "deny" } },
      sessionOverrides: { yolo: true },
    });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "bash"',
    });
  });

  it("does not prompt when UI is unavailable", async () => {
    const dialog = async () => ({ kind: "allow-once" });
    const deps = makeDeps({ dialog });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("bash", { command: "date" }),
      makeCtx(false),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "bash" (no UI)',
    });
  });

  it("injects subagent policy snapshot for subagent tool calls", async () => {
    let snapshotPath: string | undefined;
    const deps = makeDeps({
      subagentPolicy: {
        getDefaultPolicy: () => "inherit-parent",
        writePolicySnapshot: () => {
          snapshotPath = "/tmp/snapshot.json";
          return snapshotPath;
        },
        readPolicySnapshot: () => undefined,
        deletePolicySnapshot: () => {},
        isSubagentProcess: () => false,
      },
      dialog: async () => ({ kind: "allow-once" }),
    });
    const handler = createToolCallHandler(deps);
    const event = makeEvent("subagent", { agent: "scout", task: "find auth" });
    const result = await handler(event, makeCtx());
    expect(result).toBeUndefined();
    expect(snapshotPath).toBe("/tmp/snapshot.json");
    expect(event.input.MY_PERMISSION_SUBAGENT_POLICY_FILE).toBe(
      "/tmp/snapshot.json",
    );
  });

  it("uses yolo default for subagent when yoloAllSub is enabled", async () => {
    let chosenPolicy: string | undefined;
    const deps = makeDeps({
      sessionOverrides: { yoloAllSub: true },
      subagentPolicy: {
        getDefaultPolicy: (yoloAllSub) => {
          chosenPolicy = yoloAllSub ? "yolo" : "inherit-parent";
          return chosenPolicy;
        },
        writePolicySnapshot: () => "/tmp/snapshot.json",
        readPolicySnapshot: () => undefined,
        deletePolicySnapshot: () => {},
        isSubagentProcess: () => false,
      },
    });
    const handler = createToolCallHandler(deps);
    await handler(
      makeEvent("subagent", { agent: "scout", task: "find auth" }),
      makeCtx(),
    );
    expect(chosenPolicy).toBe("yolo");
  });

  it("skips subagent policy injection when the tool call is already blocked", async () => {
    const deps = makeDeps({
      configOverrides: { tools: { subagent: "deny" } },
      subagentPolicy: {
        getDefaultPolicy: () => "inherit-parent",
        writePolicySnapshot: () => {
          throw new Error("should not be called");
        },
        readPolicySnapshot: () => undefined,
        deletePolicySnapshot: () => {},
        isSubagentProcess: () => false,
      },
    });
    const handler = createToolCallHandler(deps);
    const result = await handler(
      makeEvent("subagent", { agent: "scout", task: "find auth" }),
      makeCtx(),
    );
    expect(result).toEqual({
      block: true,
      reason: 'Permission denied: tools "subagent"',
    });
  });
});
