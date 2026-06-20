import { describe, expect, it, vi, beforeEach } from "vitest";
import myPermission from "./index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function makePi() {
  const handlers: Record<string, any> = {};
  return {
    on: vi.fn((event: string, handler: any) => {
      handlers[event] = handler;
    }),
    handlers,
  } as unknown as ExtensionAPI & { handlers: Record<string, any> };
}

function makeCtx(choice?: string) {
  return {
    hasUI: true,
    ui: {
      select: vi.fn(async () => choice),
      notify: vi.fn(),
    },
    cwd: "/tmp",
  };
}

describe("myPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers session_start and tool_call handlers", () => {
    const pi = makePi();
    myPermission(pi);
    expect(pi.on).toHaveBeenCalledWith(
      "session_start",
      expect.any(Function),
    );
    expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
  });

  it("intercepts read tool calls", async () => {
    const pi = makePi();
    myPermission(pi);
    const ctx = makeCtx("Deny once");
    const result = await pi.handlers.tool_call(
      {
        type: "tool_call",
        toolName: "read",
        input: { path: "/etc/passwd" },
        toolCallId: "tc-1",
      },
      ctx,
    );
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd by user (once)",
    });
  });

  it("intercepts bash tool calls", async () => {
    const pi = makePi();
    myPermission(pi);
    const ctx = makeCtx("Deny once");
    const result = await pi.handlers.tool_call(
      {
        type: "tool_call",
        toolName: "bash",
        input: { command: "cat .env" },
        toolCallId: "tc-1",
      },
      ctx,
    );
    expect(result).toEqual({
      block: true,
      reason: "Denied bash cat .env by user (once)",
    });
  });

  it("ignores other tool calls", async () => {
    const pi = makePi();
    myPermission(pi);
    const ctx = makeCtx();
    const result = await pi.handlers.tool_call(
      {
        type: "tool_call",
        toolName: "edit",
        input: { path: "/etc/passwd" },
        toolCallId: "tc-1",
      },
      ctx,
    );
    expect(result).toBeUndefined();
  });
});
