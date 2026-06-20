import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import myPermission from "./index";

interface Captured {
  handlers: Record<string, ((event: any, ctx: any) => any)[]>;
  commands: Record<string, any>;
  tools: any[];
  renderers: Record<string, any>;
  entries: any[];
}

function makeMockPi(entries: SessionEntry[] = []): ExtensionAPI {
  const captured: Captured = {
    handlers: {},
    commands: {},
    tools: [],
    renderers: {},
    entries: [],
  };

  return {
    on: vi.fn((event: string, handler: any) => {
      captured.handlers[event] = captured.handlers[event] ?? [];
      captured.handlers[event].push(handler);
    }),
    registerCommand: vi.fn((name: string, options: any) => {
      captured.commands[name] = options;
    }),
    registerTool: vi.fn((tool: any) => {
      captured.tools.push(tool);
    }),
    registerMessageRenderer: vi.fn((customType: string, renderer: any) => {
      captured.renderers[customType] = renderer;
    }),
    appendEntry: vi.fn((customType: string, data: any) => {
      captured.entries.push({ customType, data });
    }),
    getAllTools: vi.fn(() => [
      { name: "read" },
      { name: "edit" },
      { name: "write" },
      { name: "bash" },
    ]),
    __captured: captured,
  } as unknown as ExtensionAPI;
}

function makeCommandCtx(
  entries: SessionEntry[] = [],
): ExtensionCommandContext {
  return {
    hasUI: true,
    cwd: "/tmp",
    ui: {
      notify: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn(() => entries),
    },
  } as unknown as ExtensionCommandContext;
}

function getHandler<T>(pi: ExtensionAPI, event: string): T {
  return (pi as any).__captured.handlers[event]?.[0] as T;
}

function getCommand(pi: ExtensionAPI, name: string): any {
  return (pi as any).__captured.commands[name];
}

function getAppended(pi: ExtensionAPI): { customType: string; data: any }[] {
  return (pi as any).__captured.entries;
}

describe("my-permission extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers permission command", () => {
    const pi = makeMockPi();
    myPermission(pi);
    expect(getCommand(pi, "permission")).toBeDefined();
  });

  it("loads config and restores runtime entries on session_start", async () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const pi = makeMockPi(entries);
    myPermission(pi);
    const handler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx(entries);
    await handler?.({}, ctx);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "bash" }, ctx);
    expect(block).toEqual({
      block: true,
      reason: "Tool 'bash' is denied by my-permission",
    });
  });

  it("registers a message renderer for my-permission", () => {
    const pi = makeMockPi();
    myPermission(pi);
    expect((pi as any).__captured.renderers["my-permission"]).toBeDefined();
  });

  it("denies a tool via command", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("已禁止 bash", "info");
    expect(getAppended(pi)).toEqual([
      { customType: "my-permission", data: { deny: ["bash"] } },
    ]);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "bash" }, ctx);
    expect(block).toEqual({
      block: true,
      reason: "Tool 'bash' is denied by my-permission",
    });
  });

  it("allows a tool via command", async () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        customType: "my-permission",
        data: { deny: ["bash"] },
      },
    ];
    const pi = makeMockPi(entries);
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx(entries);
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("allow bash", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("已恢复 bash", "info");
    expect(getAppended(pi)).toEqual([
      { customType: "my-permission", data: { deny: [] } },
    ]);
  });

  it("lists denied tools with sources", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);
    await command.handler("list", ctx);

    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      "当前被禁工具：\nbash (runtime)",
      "info",
    );
  });

  it("resets to config defaults", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);
    await command.handler("reset", ctx);

    expect(ctx.ui.notify).toHaveBeenLastCalledWith(
      "已恢复为配置文件默认值",
      "info",
    );
    expect(getAppended(pi)).toEqual([
      { customType: "my-permission", data: { deny: ["bash"] } },
      { customType: "my-permission", data: { deny: [] } },
    ]);
  });

  it("shows usage for unknown subcommand", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");
    const ctx = makeCommandCtx();
    await command.handler("foo", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "用法：/permission deny <tool> | allow <tool> | list | reset",
      "warning",
    );
  });

  it("shows usage for missing arguments", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");
    const ctx = makeCommandCtx();
    await command.handler("deny", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "用法：/permission deny <tool>",
      "warning",
    );
  });

  it("does not block allowed tools", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const toolHandler = getHandler<(e: any, ctx: any) => any>(pi, "tool_call");
    const block = await toolHandler?.({ toolName: "read" }, ctx);
    expect(block).toBeUndefined();
  });

  it("injects hidden message when deny list is non-empty", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const command = getCommand(pi, "permission");
    await command.handler("deny bash", ctx);

    const beforeHandler = getHandler<(e: any, ctx: any) => any>(
      pi,
      "before_agent_start",
    );
    const result = await beforeHandler?.({}, ctx);
    expect(result).toEqual({
      message: {
        customType: "my-permission",
        content:
          "The following tools are currently denied and cannot be used: bash.",
        display: false,
      },
    });
  });

  it("does not inject hidden message when deny list is empty", async () => {
    const pi = makeMockPi();
    myPermission(pi);
    const sessionHandler = getHandler<(e: any, ctx: any) => Promise<void>>(
      pi,
      "session_start",
    );
    const ctx = makeCommandCtx();
    await sessionHandler?.({}, ctx);

    const beforeHandler = getHandler<(e: any, ctx: any) => any>(
      pi,
      "before_agent_start",
    );
    const result = await beforeHandler?.({}, ctx);
    expect(result).toBeUndefined();
  });

  it("provides argument completions for deny and allow", () => {
    const pi = makeMockPi();
    myPermission(pi);
    const command = getCommand(pi, "permission");

    const completions = command.getArgumentCompletions?.("deny ");
    expect(completions).toContainEqual({
      value: "bash",
      label: "bash",
      description: "deny",
    });
  });
});
