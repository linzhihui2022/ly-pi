import { describe, expect, it, vi } from "vitest";
import myReload from "./index";

type Handler = (event: unknown, ctx: unknown) => unknown;

const MARKER_TYPE = "reload_marker";
const CONTINUE_MESSAGE = "继续之前的工作";

function setup() {
  const appendEntryCalls: Array<{ type: string; data: unknown }> = [];
  const sendUserMessageCalls: string[] = [];
  const handlers: Record<string, Handler> = {};
  let toolDef: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (...args: unknown[]) => unknown;
  } | null = null;

  const pi = {
    on: vi.fn((name: string, h: Handler) => {
      handlers[name] = h;
    }),
    registerTool: vi.fn((def: typeof toolDef) => {
      toolDef = def;
    }),
    appendEntry: vi.fn((type: string, data: unknown) => {
      appendEntryCalls.push({ type, data });
    }),
    sendUserMessage: vi.fn((content: string) => {
      sendUserMessageCalls.push(content);
    }),
  };

  myReload(pi as never);

  return { handlers, toolDef, appendEntryCalls, sendUserMessageCalls, pi };
}

// ── Helpers ──

function makeCustomEntry(customType: string, data: unknown) {
  return { type: "custom", customType, data };
}

function makeUserEntry(text: string) {
  return {
    type: "message",
    message: { role: "user" },
    content: [{ type: "text", text }],
  };
}

function makeSystemEntry(role: string, text: string) {
  return {
    type: "message",
    message: { role },
    content: [{ type: "text", text }],
  };
}

// ── request_reload tool ──

describe("request_reload tool", () => {
  it("registers a tool named request_reload with a required reason parameter", () => {
    const { toolDef } = setup();
    expect(toolDef).not.toBeNull();
    expect(toolDef!.name).toBe("request_reload");
    expect(toolDef!.description).toBeTruthy();
    const schema = toolDef!.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.reason).toBeDefined();
    expect(schema.required).toContain("reason");
  });

  it("appends a pending reload_marker entry and returns a user-facing message", async () => {
    const { toolDef, appendEntryCalls } = setup();
    const result = await toolDef!.execute("call-1", { reason: "changed my-hud render logic" });
    expect(appendEntryCalls).toHaveLength(1);
    expect(appendEntryCalls[0].type).toBe(MARKER_TYPE);
    expect(appendEntryCalls[0].data).toEqual({
      reason: "changed my-hud render logic",
      pending: true,
    });
    expect(result).toHaveProperty("content");
    const text = (result as { content: Array<{ type: string; text: string }> }).content[0].text;
    expect(text).toContain("reload");
    expect(text).toContain("changed my-hud render logic");
  });
});

// ── session_start handler ──

describe("session_start auto-resume", () => {
  it("registers a session_start handler", () => {
    const { handlers } = setup();
    expect(handlers["session_start"]).toBeDefined();
  });

  it("does nothing when reason is not 'reload'", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: { getEntries: () => [] },
    };

    handlers["session_start"]({ reason: "startup" }, ctx);
    handlers["session_start"]({ reason: "new" }, ctx);
    handlers["session_start"]({ reason: "resume" }, ctx);
    handlers["session_start"]({ reason: "fork" }, ctx);

    expect(sendUserMessageCalls).toHaveLength(0);
  });

  it("does nothing when entries are empty", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: { getEntries: () => [] },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  it("does nothing when no pending reload_marker exists in entries", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: {
        getEntries: () => [makeUserEntry("hello")],
      },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  it("triggers auto-continue when pending marker exists — system entries after marker are OK", () => {
    const { handlers, sendUserMessageCalls } = setup();
    // Simulate real flow: marker → toolResult → assistant (no user message after marker)
    const ctx = {
      hasUI: true,
      sessionManager: {
        getEntries: () => [
          makeUserEntry("help me refactor"),
          makeCustomEntry(MARKER_TYPE, { reason: "changed my-hud", pending: true }),
          makeSystemEntry("toolResult", "已标记，请 /reload"),
          makeSystemEntry("assistant", "ok 已标记"),
        ],
      },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);

    expect(sendUserMessageCalls).toHaveLength(1);
    expect(sendUserMessageCalls[0]).toBe(CONTINUE_MESSAGE);
  });

  it("does not trigger when a user message exists after the marker", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: {
        getEntries: () => [
          makeCustomEntry(MARKER_TYPE, { reason: "changed my-hud", pending: true }),
          makeUserEntry("actually wait let me check something"),
        ],
      },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  it("does not trigger when user message exists between marker and end (with system entries mixed)", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: {
        getEntries: () => [
          makeCustomEntry(MARKER_TYPE, { reason: "changed my-hud", pending: true }),
          makeSystemEntry("toolResult", "已标记"),
          makeUserEntry("wait, let me check something first"),
          makeSystemEntry("assistant", "ok checking..."),
        ],
      },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  it("does not trigger when marker has pending: false", () => {
    const { handlers, sendUserMessageCalls } = setup();
    const ctx = {
      hasUI: true,
      sessionManager: {
        getEntries: () => [
          makeUserEntry("hello"),
          makeCustomEntry(MARKER_TYPE, { reason: "was reloaded", pending: false }),
        ],
      },
    };

    handlers["session_start"]({ reason: "reload" }, ctx);
    expect(sendUserMessageCalls).toHaveLength(0);
  });
});
