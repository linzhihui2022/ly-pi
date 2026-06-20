import { describe, expect, it, vi } from "vitest";
import { ReadPermission } from "./read";
import { PermissionState } from "./state";
import type {
  ExtensionContext,
  ReadToolCallEvent,
} from "@earendil-works/pi-coding-agent";

function makeEvent(path: string): ReadToolCallEvent {
  return {
    type: "tool_call",
    toolName: "read",
    input: { path },
    toolCallId: "tc-1",
  } as ReadToolCallEvent;
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

describe("ReadPermission.check", () => {
  it("returns ask when config is not loaded", () => {
    const perm = new ReadPermission(
      makeState(),
      makeEvent("/etc/passwd"),
      makeCtx(true),
    );
    expect(perm.check()).toEqual({
      action: "ask",
      rule: "default",
      from: "config",
    });
  });

  it("matches config path rules", () => {
    const state = makeState({
      permission: {
        path: [{ key: "/etc/passwd", value: "deny" }],
        bash: [],
        tool: [],
      },
    });
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
    expect(perm.check()).toEqual({
      action: "deny",
      rule: "/etc/passwd",
      from: "config",
    });
  });

  it("runtime allow overrides config deny", () => {
    const state = makeState({
      permission: {
        path: [{ key: "/etc/passwd", value: "deny" }],
        bash: [],
        tool: [],
      },
    });
    state.runtimeConfig.path.push({ key: "/etc/passwd", value: "allow" });
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
    expect(perm.check()).toEqual({ action: "allow" });
  });

  it("falls back to config when runtime does not match", () => {
    const state = makeState({
      permission: {
        path: [{ key: "*.env", value: "deny" }],
        bash: [],
        tool: [],
      },
    });
    state.runtimeConfig.path.push({ key: "/etc/passwd", value: "allow" });
    const perm = new ReadPermission(state, makeEvent("secret.env"), makeCtx(true));
    expect(perm.check()).toEqual({
      action: "deny",
      rule: "*.env",
      from: "config",
    });
  });
});

describe("ReadPermission.handleAction", () => {
  it("allow returns undefined", async () => {
    const perm = new ReadPermission(
      makeState(),
      makeEvent("/etc/passwd"),
      makeCtx(true),
    );
    const result = await perm.handleAction({ action: "allow" });
    expect(result).toBeUndefined();
  });

  it("deny returns block with correct reason", async () => {
    const state = makeState({
      permission: {
        path: [{ key: "/etc/passwd", value: "deny" }],
        bash: [],
        tool: [],
      },
    });
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), makeCtx(true));
    const result = await perm.handleAction({
      action: "deny",
      rule: "/etc/passwd",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: 'Denied read /etc/passwd by rule "/etc/passwd" (config)',
    });
  });

  it("ask without UI blocks", async () => {
    const perm = new ReadPermission(
      makeState(),
      makeEvent("/etc/passwd"),
      makeCtx(false),
    );
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd (no UI available for approval)",
    });
  });

  it("ask allow once returns undefined", async () => {
    const ctx = makeCtx(true, "Allow once");
    const perm = new ReadPermission(makeState(), makeEvent("/etc/passwd"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toBeUndefined();
    expect(ctx.ui.select).toHaveBeenCalledWith("Allow read /etc/passwd?", [
      "Allow once",
      "Allow for this session",
      "Deny once",
      "Deny for this session",
    ]);
  });

  it("ask allow session stores runtime rule", async () => {
    const state = makeState();
    const ctx = makeCtx(true, "Allow for this session");
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toBeUndefined();
    expect(state.runtimeConfig.path).toEqual([
      { key: "/etc/passwd", value: "allow" },
    ]);
  });

  it("ask deny once blocks without storing rule", async () => {
    const state = makeState();
    const ctx = makeCtx(true, "Deny once");
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd by user (once)",
    });
    expect(state.runtimeConfig.path).toEqual([]);
  });

  it("ask deny session stores runtime deny rule", async () => {
    const state = makeState();
    const ctx = makeCtx(true, "Deny for this session");
    const perm = new ReadPermission(state, makeEvent("/etc/passwd"), ctx);
    const result = await perm.handleAction({
      action: "ask",
      rule: "default",
      from: "config",
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd by user (session)",
    });
    expect(state.runtimeConfig.path).toEqual([
      { key: "/etc/passwd", value: "deny" },
    ]);
  });
});
