import { describe, expect, it, vi } from "vitest";
import { createGuardHarness, type GuardConfig } from "./guard-harness";

type Handler = (event: unknown, ctx: unknown) => unknown;

function setup(guards: GuardConfig[]) {
  const handlers: Record<string, Handler> = {};
  const pi = {
    on: vi.fn((name: string, h: Handler) => {
      handlers[name] = h;
    }),
  };
  createGuardHarness(pi as never, guards);
  return { handlers, pi };
}

function bashEvent(command: string) {
  return {
    type: "tool_call",
    toolCallId: "call-1",
    toolName: "bash" as const,
    input: { command },
  };
}

function readEvent() {
  return {
    type: "tool_call",
    toolCallId: "call-2",
    toolName: "read" as const,
    input: { path: "file.txt" },
  };
}

function ctx(
  overrides: {
    hasUI?: boolean;
    cwd?: string;
    confirm?: () => Promise<boolean>;
  } = {},
) {
  return {
    hasUI: overrides.hasUI ?? true,
    cwd: overrides.cwd ?? "/repo",
    ui: {
      notify: vi.fn(),
      confirm: vi.fn(overrides.confirm ?? (async () => false)),
    },
  };
}

describe("createGuardHarness", () => {
  describe("tool_call hook", () => {
    it("registers a tool_call handler", () => {
      const { handlers } = setup([]);
      expect(handlers.tool_call).toBeDefined();
    });

    it("ignores non-bash tool events", async () => {
      const detect = vi.fn();
      const { handlers } = setup([{ name: "test", detect, react: vi.fn() }]);
      await handlers.tool_call(readEvent(), ctx());
      expect(detect).not.toHaveBeenCalled();
    });

    it("calls detect with command and cwd for bash events", async () => {
      const detect = vi.fn().mockReturnValue(undefined);
      const { handlers } = setup([{ name: "test", detect, react: vi.fn() }]);
      await handlers.tool_call(bashEvent("git status"), ctx({ cwd: "/repo" }));
      expect(detect).toHaveBeenCalledWith("git status", "/repo");
    });

    it("calls react when detect returns a non-undefined value", async () => {
      const detection = { found: true };
      const detect = vi.fn().mockReturnValue(detection);
      const react = vi.fn();
      const { handlers } = setup([{ name: "test", detect, react }]);
      await handlers.tool_call(bashEvent("bad command"), ctx());
      expect(react).toHaveBeenCalledWith(
        detection,
        expect.objectContaining({ toolName: "bash" }),
        expect.anything(),
      );
    });

    it("does not call react when detect returns undefined", async () => {
      const detect = vi.fn().mockReturnValue(undefined);
      const react = vi.fn();
      const { handlers } = setup([{ name: "test", detect, react }]);
      await handlers.tool_call(bashEvent("ok"), ctx());
      expect(react).not.toHaveBeenCalled();
    });

    it("returns react's block result", async () => {
      const guard: GuardConfig = {
        name: "test",
        detect: () => ({ bad: true }),
        react: () => ({ block: true, reason: "blocked" }),
      };
      const { handlers } = setup([guard]);
      const result = await handlers.tool_call(bashEvent("x"), ctx());
      expect(result).toEqual({ block: true, reason: "blocked" });
    });

    it("returns undefined when react returns void", async () => {
      const guard: GuardConfig = {
        name: "test",
        detect: () => ({ ok: true }),
        react: () => {},
      };
      const { handlers } = setup([guard]);
      const result = await handlers.tool_call(bashEvent("x"), ctx());
      expect(result).toBeUndefined();
    });

    it("runs guards in registration order", async () => {
      const calls: string[] = [];
      const makeGuard = (name: string): GuardConfig => ({
        name,
        detect: () => {
          calls.push(`${name}:detect`);
          return { name };
        },
        react: (det) => {
          calls.push(`${(det as { name: string }).name}:react`);
        },
      });
      const { handlers } = setup([makeGuard("A"), makeGuard("B")]);
      await handlers.tool_call(bashEvent("x"), ctx());
      expect(calls).toEqual(["A:detect", "A:react", "B:detect", "B:react"]);
    });

    it("stops at the first guard that blocks", async () => {
      const calls: string[] = [];
      const blocking: GuardConfig = {
        name: "blocker",
        detect: () => {
          calls.push("blocker:detect");
          return { x: 1 };
        },
        react: () => {
          calls.push("blocker:react");
          return { block: true, reason: "no" };
        },
      };
      const after: GuardConfig = {
        name: "after",
        detect: vi.fn(),
        react: vi.fn(),
      };
      const { handlers } = setup([blocking, after]);
      const result = await handlers.tool_call(bashEvent("x"), ctx());
      expect(result?.block).toBe(true);
      expect(after.detect).not.toHaveBeenCalled();
      expect(calls).toEqual(["blocker:detect", "blocker:react"]);
    });
  });

  describe("escalation", () => {
    it("increments escalation counter on each detection", async () => {
      const detect = vi.fn().mockReturnValue({ x: 1 });
      const react = vi.fn().mockReturnValue({ block: true, reason: "no" });
      const guard: GuardConfig = {
        name: "g",
        detect,
        react,
        escalation: {
          threshold: 3,
          buildConfirm: () => ({ title: "T", body: "B" }),
        },
      };
      const { handlers } = setup([guard]);
      const c = ctx();

      // Calls 1-3: under threshold, no confirm
      for (let i = 0; i < 3; i++) {
        await handlers.tool_call(bashEvent("x"), c);
      }
      expect(c.ui.confirm).not.toHaveBeenCalled();
      expect(react).toHaveBeenCalledTimes(3);

      // Call 4: over threshold, confirm shown
      await handlers.tool_call(bashEvent("x"), c);
      expect(c.ui.confirm).toHaveBeenCalledTimes(1);
    });

    it("skips react when user approves via confirm", async () => {
      const react = vi.fn().mockReturnValue({ block: true, reason: "no" });
      const guard: GuardConfig = {
        name: "g",
        detect: () => ({ x: 1 }),
        react,
        escalation: {
          threshold: 2,
          buildConfirm: () => ({ title: "T", body: "B" }),
        },
      };
      const { handlers } = setup([guard]);
      const c = ctx({ confirm: async () => true });

      for (let i = 0; i < 2; i++) {
        await handlers.tool_call(bashEvent("x"), c);
      }
      // 3rd call: over threshold, user approves
      const result = await handlers.tool_call(bashEvent("x"), c);
      expect(c.ui.confirm).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
      // react called 2 times (first two under threshold), not the 3rd
      expect(react).toHaveBeenCalledTimes(2);
    });

    it("still calls react when user rejects confirm", async () => {
      const react = vi.fn().mockReturnValue({ block: true, reason: "no" });
      const guard: GuardConfig = {
        name: "g",
        detect: () => ({ x: 1 }),
        react,
        escalation: {
          threshold: 2,
          buildConfirm: () => ({ title: "T", body: "B" }),
        },
      };
      const { handlers } = setup([guard]);
      const c = ctx({ confirm: async () => false });

      for (let i = 0; i < 2; i++) {
        await handlers.tool_call(bashEvent("x"), c);
      }
      const result = await handlers.tool_call(bashEvent("x"), c);
      expect(c.ui.confirm).toHaveBeenCalledTimes(1);
      expect(result?.block).toBe(true);
      expect(react).toHaveBeenCalledTimes(3);
    });

    it("never confirms when UI is unavailable", async () => {
      const react = vi.fn().mockReturnValue({ block: true, reason: "no" });
      const guard: GuardConfig = {
        name: "g",
        detect: () => ({ x: 1 }),
        react,
        escalation: {
          threshold: 2,
          buildConfirm: () => ({ title: "T", body: "B" }),
        },
      };
      const { handlers } = setup([guard]);
      const c = ctx({ hasUI: false });

      for (let i = 0; i < 5; i++) {
        await handlers.tool_call(bashEvent("x"), c);
      }
      expect(c.ui.confirm).not.toHaveBeenCalled();
      expect(react).toHaveBeenCalledTimes(5);
    });

    it("tracks escalation counters per guard independently", async () => {
      const reactA = vi.fn().mockReturnValue({ block: true, reason: "A" });
      const reactB = vi.fn().mockReturnValue({ block: true, reason: "B" });
      const makeGuard = (name: string, react: () => unknown): GuardConfig => ({
        name,
        detect: () => ({ x: 1 }),
        react,
        escalation: {
          threshold: 1,
          buildConfirm: () => ({ title: "T", body: "B" }),
        },
      });
      const { handlers } = setup([
        makeGuard("A", reactA),
        makeGuard("B", reactB),
      ]);
      const c = ctx({ confirm: async () => true });

      // A triggers first, blocks immediately
      await handlers.tool_call(bashEvent("x"), c);
      expect(reactA).toHaveBeenCalledTimes(1);
      // B never reached because A blocked
    });
  });

  describe("lifecycle hooks", () => {
    it("registers session_start and before_agent_start handlers", () => {
      const { handlers } = setup([]);
      expect(handlers.session_start).toBeDefined();
      expect(handlers.before_agent_start).toBeDefined();
    });

    it("calls onSessionStart for each guard", async () => {
      const onSessionStart = vi.fn();
      const { handlers } = setup([
        { name: "g", detect: vi.fn(), react: vi.fn(), onSessionStart },
      ]);
      await handlers.session_start({}, ctx({ cwd: "/proj" }));
      expect(onSessionStart).toHaveBeenCalledWith("/proj");
    });

    it("does not throw when a guard lacks onSessionStart", async () => {
      const { handlers } = setup([
        { name: "g", detect: vi.fn(), react: vi.fn() },
      ]);
      // Should not throw
      await handlers.session_start({}, ctx());
    });

    it("chains onBeforeAgentStart across guards", async () => {
      const guardA: GuardConfig = {
        name: "A",
        detect: vi.fn(),
        react: vi.fn(),
        onBeforeAgentStart: (p) => `${p} |A`,
      };
      const guardB: GuardConfig = {
        name: "B",
        detect: vi.fn(),
        react: vi.fn(),
        onBeforeAgentStart: (p) => `${p} |B`,
      };
      const { handlers } = setup([guardA, guardB]);
      const result = await handlers.before_agent_start(
        { systemPrompt: "base" },
        ctx(),
      );
      expect(result).toEqual({ systemPrompt: "base |A |B" });
    });

    it("skips guard without onBeforeAgentStart in chain", async () => {
      const guardA: GuardConfig = {
        name: "A",
        detect: vi.fn(),
        react: vi.fn(),
        onBeforeAgentStart: (p) => `${p} |A`,
      };
      const guardB: GuardConfig = {
        name: "B",
        detect: vi.fn(),
        react: vi.fn(),
      };
      const guardC: GuardConfig = {
        name: "C",
        detect: vi.fn(),
        react: vi.fn(),
        onBeforeAgentStart: (p) => `${p} |C`,
      };
      const { handlers } = setup([guardA, guardB, guardC]);
      const result = await handlers.before_agent_start(
        { systemPrompt: "base" },
        ctx(),
      );
      expect(result).toEqual({ systemPrompt: "base |A |C" });
    });
  });

  describe("error handling", () => {
    it("catches and skips a guard that throws in detect, continuing to next guard", async () => {
      const badDetect = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const goodDetect = vi.fn().mockReturnValue(undefined);
      const bad: GuardConfig = {
        name: "bad",
        detect: badDetect,
        react: vi.fn(),
      };
      const good: GuardConfig = {
        name: "good",
        detect: goodDetect,
        react: vi.fn(),
      };
      const { handlers } = setup([bad, good]);
      await handlers.tool_call(bashEvent("x"), ctx());
      expect(goodDetect).toHaveBeenCalled();
    });

    it("catches and skips a guard that throws in react, continuing to next guard", async () => {
      const badReact = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const goodDetect = vi.fn().mockReturnValue(undefined);
      const bad: GuardConfig = {
        name: "bad",
        detect: () => ({ x: 1 }),
        react: badReact,
      };
      const good: GuardConfig = {
        name: "good",
        detect: goodDetect,
        react: vi.fn(),
      };
      const { handlers } = setup([bad, good]);
      await handlers.tool_call(bashEvent("x"), ctx());
      expect(goodDetect).toHaveBeenCalled();
    });

    it("catches errors in onSessionStart without affecting other guards", async () => {
      const bad = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const good = vi.fn();
      const { handlers } = setup([
        { name: "bad", detect: vi.fn(), react: vi.fn(), onSessionStart: bad },
        { name: "good", detect: vi.fn(), react: vi.fn(), onSessionStart: good },
      ]);
      await handlers.session_start({}, ctx());
      expect(good).toHaveBeenCalled();
    });

    it("catches errors in onBeforeAgentStart without affecting other guards", async () => {
      const bad = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const good = vi.fn().mockReturnValue("augmented");
      const { handlers } = setup([
        {
          name: "bad",
          detect: vi.fn(),
          react: vi.fn(),
          onBeforeAgentStart: bad,
        },
        {
          name: "good",
          detect: vi.fn(),
          react: vi.fn(),
          onBeforeAgentStart: good,
        },
      ]);
      const result = await handlers.before_agent_start(
        { systemPrompt: "base" },
        ctx(),
      );
      expect(result?.systemPrompt).toBe("augmented");
    });
  });
});
