import { describe, expect, it, vi } from "vitest";
import myCdGuard from "./index";

type Handler = (event: unknown, ctx: unknown) => unknown;

function fullSetup() {
  const handlers: Record<string, Handler> = {};
  const pi = {
    on: vi.fn((name: string, h: Handler) => {
      handlers[name] = h;
    }),
  };
  myCdGuard(pi as never);
  return { handlers, pi };
}

function setupToolCall() {
  const { handlers } = fullSetup();
  const handler = handlers["tool_call"];
  if (!handler) throw new Error("tool_call handler not registered");
  return handler;
}

function ctxWith(hasUI: boolean) {
  return {
    hasUI,
    cwd: "/repo",
    ui: { notify: vi.fn() },
  };
}

describe("myCdGuard before_agent_start handler", () => {
  it("appends a cd-prevention hint when projectRoot is set", async () => {
    const { handlers } = fullSetup();
    const sessionStart = handlers["session_start"];
    const beforeAgentStart = handlers["before_agent_start"];
    if (!sessionStart || !beforeAgentStart)
      throw new Error("handlers not registered");

    await sessionStart({}, { cwd: "/repo" });
    const result = await beforeAgentStart({
      systemPrompt: "Existing prompt.",
    });
    expect(result).toBeDefined();
    expect(result!.systemPrompt).toContain("Existing prompt.");
    expect(result!.systemPrompt).toContain("/repo");
    expect(result!.systemPrompt).toContain("CRITICAL");
  });

  it("returns undefined when projectRoot is not yet set", async () => {
    const { handlers } = fullSetup();
    const beforeAgentStart = handlers["before_agent_start"];
    if (!beforeAgentStart)
      throw new Error("before_agent_start handler not registered");

    const result = await beforeAgentStart({
      systemPrompt: "Existing prompt.",
    });
    expect(result).toBeUndefined();
  });
});

describe("myCdGuard tool_call handler", () => {
  it("rewrites a redundant cd prefix in place and notifies", async () => {
    const handler = setupToolCall();
    const ctx = ctxWith(true);
    const event = {
      toolName: "bash",
      input: { command: "cd /repo && git status" },
    };
    await handler(event, ctx);
    expect(event.input.command).toBe("git status");
    expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
    expect(ctx.ui.notify.mock.calls[0]?.[0]).toContain("cd /repo");
  });

  it("leaves other commands untouched and stays silent", async () => {
    const handler = setupToolCall();
    const ctx = ctxWith(true);
    const event = { toolName: "bash", input: { command: "git status" } };
    await handler(event, ctx);
    expect(event.input.command).toBe("git status");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("rewrites silently when there is no UI", async () => {
    const handler = setupToolCall();
    const ctx = ctxWith(false);
    const event = { toolName: "bash", input: { command: "cd /repo && ls" } };
    await handler(event, ctx);
    expect(event.input.command).toBe("ls");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("ignores non-bash tools", async () => {
    const handler = setupToolCall();
    const ctx = ctxWith(true);
    const event = { toolName: "edit", input: { path: "cd /repo && x" } };
    await handler(event, ctx);
    expect(event.input.path).toBe("cd /repo && x");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
});
