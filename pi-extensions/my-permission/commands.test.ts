import { describe, expect, it } from "vitest";
import { registerPermissionCommands } from "./commands.js";
import type { SessionState } from "./session-state.js";

function makeSessionState(initial: Partial<SessionState> = {}): SessionState {
  const rules: SessionState["sessionRules"] = [];
  let yolo = initial.yolo ?? false;
  let yoloAllSub = initial.yoloAllSub ?? false;
  return {
    get yolo() { return yolo; },
    get yoloAllSub() { return yoloAllSub; },
    sessionRules: rules,
    toggleYolo: () => { yolo = !yolo; },
    toggleYoloAllSub: () => { yoloAllSub = !yoloAllSub; },
    addSessionRule: (rule) => rules.push(rule),
    restoreSessionRules: (rs) => {
      rules.length = 0;
      rules.push(...rs);
    },
    findSessionRule: () => undefined,
    forEachSessionRuleEntry: (cb) => rules.forEach(cb),
    clear: () => {
      rules.length = 0;
    },
  };
}

function makeMockPi() {
  const commands: Record<string, (args: string, ctx: any) => Promise<void>> = {};
  const notifications: Array<{ message: string; type?: string }> = [];
  const ctx = {
    ui: {
      notify: (message: string, type?: string) => {
        notifications.push({ message, type });
      },
    },
  };

  return {
    commands,
    notifications,
    ctx,
    registerCommand: (name: string, options: { handler: (args: string, ctx: any) => Promise<void> }) => {
      commands[name] = options.handler;
    },
  };
}

describe("registerPermissionCommands", () => {
  it("registers /yolo and /yolo-all-sub", () => {
    const pi = makeMockPi();
    registerPermissionCommands(pi as any, makeSessionState());
    expect(Object.keys(pi.commands)).toContain("yolo");
    expect(Object.keys(pi.commands)).toContain("yolo-all-sub");
  });

  it("/yolo toggles yolo on and reports state", async () => {
    const pi = makeMockPi();
    const state = makeSessionState({ toggleYolo: () => { state.yolo = true; } });
    registerPermissionCommands(pi as any, state);

    await pi.commands["yolo"]("", pi.ctx);
    expect(state.yolo).toBe(true);
    expect(pi.notifications[0].message).toContain("enabled");
  });

  it("/yolo toggles yolo off and reports state", async () => {
    const pi = makeMockPi();
    const state = makeSessionState({ yolo: true, toggleYolo: () => { state.yolo = false; } });
    registerPermissionCommands(pi as any, state);

    await pi.commands["yolo"]("", pi.ctx);
    expect(state.yolo).toBe(false);
    expect(pi.notifications[0].message).toContain("disabled");
  });

  it("/yolo-all-sub toggles yoloAllSub on and reports state", async () => {
    const pi = makeMockPi();
    const state = makeSessionState({ toggleYoloAllSub: () => { state.yoloAllSub = true; } });
    registerPermissionCommands(pi as any, state);

    await pi.commands["yolo-all-sub"]("", pi.ctx);
    expect(state.yoloAllSub).toBe(true);
    expect(pi.notifications[0].message).toContain("enabled");
  });

  it("/yolo-all-sub toggles yoloAllSub off and reports state", async () => {
    const pi = makeMockPi();
    const state = makeSessionState({ yoloAllSub: true, toggleYoloAllSub: () => { state.yoloAllSub = false; } });
    registerPermissionCommands(pi as any, state);

    await pi.commands["yolo-all-sub"]("", pi.ctx);
    expect(state.yoloAllSub).toBe(false);
    expect(pi.notifications[0].message).toContain("disabled");
  });
});
