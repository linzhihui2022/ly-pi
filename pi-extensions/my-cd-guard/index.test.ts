import { describe, expect, it, vi } from "vitest";
import myCdGuard from "./index";

type ToolCallHandler = (event: unknown, ctx: unknown) => unknown;

function setup() {
  let handler: ToolCallHandler | undefined;
  const pi = {
    on: vi.fn((name: string, h: ToolCallHandler) => {
      if (name === "tool_call") handler = h;
    }),
  };
  myCdGuard(pi as never);
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

describe("myCdGuard tool_call handler", () => {
  it("rewrites a redundant cd prefix in place and notifies", async () => {
    const handler = setup();
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
    const handler = setup();
    const ctx = ctxWith(true);
    const event = { toolName: "bash", input: { command: "git status" } };
    await handler(event, ctx);
    expect(event.input.command).toBe("git status");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("rewrites silently when there is no UI", async () => {
    const handler = setup();
    const ctx = ctxWith(false);
    const event = { toolName: "bash", input: { command: "cd /repo && ls" } };
    await handler(event, ctx);
    expect(event.input.command).toBe("ls");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("ignores non-bash tools", async () => {
    const handler = setup();
    const ctx = ctxWith(true);
    const event = { toolName: "edit", input: { path: "cd /repo && x" } };
    await handler(event, ctx);
    expect(event.input.path).toBe("cd /repo && x");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
});
