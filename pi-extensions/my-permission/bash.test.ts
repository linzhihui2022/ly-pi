import { describe, expect, it, vi } from "vitest";
import { BashPermission } from "./bash";
import { PermissionState } from "./state";
import type {
  ExtensionContext,
  BashToolCallEvent,
} from "@earendil-works/pi-coding-agent";

function makeEvent(command: string): BashToolCallEvent {
  return {
    type: "tool_call",
    toolName: "bash",
    input: { command },
    toolCallId: "tc-1",
  } as BashToolCallEvent;
}

function makeCtx(hasUI: boolean, choice?: string): ExtensionContext {
  return {
    hasUI,
    ui: {
      select: vi.fn(async () => choice),
      notify: vi.fn(),
    },
    cwd: "/tmp",
  } as unknown as ExtensionContext;
}

function makeState(config?: any) {
  const state = new PermissionState();
  if (config) state.init(config);
  return state;
}

describe("BashPermission.check", () => {
  it("returns ask when config is not loaded", () => {
    const perm = new BashPermission(
      makeState(),
      makeEvent("cat .env"),
      makeCtx(true),
    );
    expect(perm.check()).toEqual({
      action: "ask",
      rule: "default",
      from: "config",
    });
  });

  it("matches config bash regex rules", () => {
    const state = makeState({
      permission: {
        path: [],
        bash: [{ key: "\\.env", value: "deny" }],
        tool: [],
      },
    });
    const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
    expect(perm.check()).toEqual({
      action: "deny",
      rule: "\\.env",
      from: "config",
    });
  });

  it("runtime allow overrides config deny", () => {
    const state = makeState({
      permission: {
        path: [],
        bash: [{ key: "\\.env", value: "deny" }],
        tool: [],
      },
    });
    state.runtimeConfig.bash.push({ key: "cat \\.env", value: "allow" });
    const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
    expect(perm.check()).toEqual({ action: "allow" });
  });
});

describe("BashPermission.handleAction", () => {
  it("allow returns undefined", async () => {
    const perm = new BashPermission(
      makeState(),
      makeEvent("cat .env"),
      makeCtx(true),
    );
    const result = await perm.handleAction({ action: "allow" });
    expect(result).toBeUndefined();
  });

  it("deny returns block with correct reason", async () => {
    const state = makeState({
      permission: {
        path: [],
        bash: [{ key: "\\.env", value: "deny" }],
        tool: [],
      },
    });
    const perm = new BashPermission(state, makeEvent("cat .env"), makeCtx(true));
    const result = await perm.handleAction({
      action: "deny",
      rule: "\\.env",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: 'Denied bash cat .env by rule "\\.env" (config)',
    });
  });

  it("ask allow session stores runtime rule", async () => {
    const state = makeState();
    const ctx = makeCtx(true, "Allow for this session");
    const perm = new BashPermission(state, makeEvent("curl example.com"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toBeUndefined();
    expect(state.runtimeConfig.bash).toEqual([
      { key: "curl example.com", value: "allow" },
    ]);
  });

  it("ask deny session stores runtime deny rule", async () => {
    const state = makeState();
    const ctx = makeCtx(true, "Deny for this session");
    const perm = new BashPermission(state, makeEvent("curl example.com"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied bash curl example.com by user (session)",
    });
    expect(state.runtimeConfig.bash).toEqual([
      { key: "curl example.com", value: "deny" },
    ]);
  });
});
