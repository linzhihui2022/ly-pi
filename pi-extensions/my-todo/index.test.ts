import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const registeredEvents = new Map<string, (...args: any[]) => any>();
const registeredTools: any[] = [];
const registeredCommands = new Map<string, any>();
const widgetLines: (string[] | undefined)[] = [];

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerTool: vi.fn((def: any) => {
    registeredTools.push(def);
  }),
  registerCommand: vi.fn((name: string, options: any) => {
    registeredCommands.set(name, options);
  }),
};

const createMockCtx = (entries: any[] = []) => ({
  hasUI: true,
  ui: {
    setWidget: vi.fn((_name: string, lines?: string[]) => {
      widgetLines.push(lines);
    }),
    notify: vi.fn(),
  },
  sessionManager: {
    getEntries: vi.fn(() => entries),
  },
});

async function loadModule() {
  return await import("./index");
}

beforeEach(() => {
  registeredEvents.clear();
  registeredTools.length = 0;
  registeredCommands.clear();
  widgetLines.length = 0;
  vi.clearAllMocks();
});

describe("my-todo extension", () => {
  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers todo tool", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "todo" })
    );
  });

  it("registers /todos command", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "todos",
      expect.any(Object)
    );
  });

  it("subscribes to session_start", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(registeredEvents.has("session_start")).toBe(true);
  });

  it("subscribes to turn_start and turn_end", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(registeredEvents.has("turn_start")).toBe(true);
    expect(registeredEvents.has("turn_end")).toBe(true);
  });

  it("session_start restores state from entries and renders overlay", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const handler = registeredEvents.get("session_start")!;
    const ctx = createMockCtx([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            tasks: [{ id: 1, subject: "A", status: "pending" }],
            nextId: 2,
          },
        },
      },
    ]);

    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo",
      expect.any(Array)
    );
  });

  it("session_start hides widget when no tasks", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const handler = registeredEvents.get("session_start")!;
    const ctx = createMockCtx([]);
    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
  });

  it("todo tool create action works", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "create", subject: "Test" },
      undefined,
      undefined,
      ctx
    );

    expect(result.content[0].text).toContain("Created task #1");
    expect(result.details.tasks).toHaveLength(1);
    expect(ctx.ui.setWidget).toHaveBeenCalled();
  });

  it("todo tool returns error on invalid action", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "bad_action" },
      undefined,
      undefined,
      ctx
    );

    expect(result.isError).toBe(true);
  });

  it("/todos command lists tasks", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "Task A" },
      undefined,
      undefined,
      ctx
    );

    const cmd = registeredCommands.get("todos")!;
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Task A"),
      "info"
    );
  });

  it("/todos command shows 'No tasks' when empty", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);

    const cmd = registeredCommands.get("todos")!;
    const ctx = createMockCtx();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No tasks.", "info");
  });
});
