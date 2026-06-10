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
    setWidget: vi.fn((_name: string, _factory?: unknown) => {
      widgetLines.push(undefined);
    }),
    notify: vi.fn(),
  },
  sessionManager: {
    getEntries: vi.fn(() => entries),
  },
});

beforeEach(() => {
  registeredEvents.clear();
  registeredTools.length = 0;
  registeredCommands.clear();
  widgetLines.length = 0;
  vi.clearAllMocks();
});

async function initExtension() {
  const mod = await import("./index");
  mod.default(mockPi as unknown as ExtensionAPI);
}

describe("my-todo extension", () => {
  it("exports a default function", async () => {
    const mod = await import("./index");
    expect(typeof mod.default).toBe("function");
  });

  it("registers todo tool", async () => {
    await initExtension();
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "todo" })
    );
  });

  it("registers /todos command", async () => {
    await initExtension();
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "todos",
      expect.any(Object)
    );
  });

  it("subscribes to session_start", async () => {
    await initExtension();
    expect(registeredEvents.has("session_start")).toBe(true);
  });

  it("subscribes to turn_start and turn_end", async () => {
    await initExtension();
    expect(registeredEvents.has("turn_start")).toBe(true);
    expect(registeredEvents.has("turn_end")).toBe(true);
  });

  it("session_start restores state from entries and renders overlay", async () => {
    await initExtension();

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
      expect.any(Function)
    );
  });

  it("session_start hides widget when no tasks", async () => {
    await initExtension();

    const handler = registeredEvents.get("session_start")!;
    const ctx = createMockCtx([]);
    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
  });

  it("turn_start refreshes overlay", async () => {
    await initExtension();

    // First create a task via session_start
    const sessionHandler = registeredEvents.get("session_start")!;
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
    await sessionHandler({}, ctx);
    const setWidgetCalls = ctx.ui.setWidget.mock.calls.length;

    // Now trigger turn_start
    const turnHandler = registeredEvents.get("turn_start")!;
    await turnHandler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledTimes(setWidgetCalls + 1);
  });

  it("turn_end refreshes overlay", async () => {
    await initExtension();

    const sessionHandler = registeredEvents.get("session_start")!;
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
    await sessionHandler({}, ctx);

    const turnHandler = registeredEvents.get("turn_end")!;
    await turnHandler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalled();
  });

  it("turn_start hides widget when no tasks", async () => {
    await initExtension();

    const handler = registeredEvents.get("turn_start")!;
    const ctx = createMockCtx();
    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
  });

  it("todo tool create action works", async () => {
    await initExtension();

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

  it("todo tool create with description", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "create", subject: "Test", description: "Desc" },
      undefined,
      undefined,
      ctx
    );

    expect(result.content[0].text).toContain("Created task #1");
    expect(result.details.tasks[0].description).toBe("Desc");
  });

  it("todo tool create without subject returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "create" },
      undefined,
      undefined,
      ctx
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("subject is required");
  });

  it("todo tool returns error on invalid action", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "bad_action" as any },
      undefined,
      undefined,
      ctx
    );

    expect(result.isError).toBe(true);
  });

  it("todo tool list action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);
    await toolDef.execute("tc-1", { action: "create", subject: "B" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "list" }, undefined, undefined, ctx);
    expect(result.content[0].text).toContain("○ #1 A");
    expect(result.content[0].text).toContain("○ #2 B");
  });

  it("todo tool list with includeDeleted", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);
    await toolDef.execute("tc-1", { action: "delete", id: 1 }, undefined, undefined, ctx);

    const resultWithDeleted = await toolDef.execute("tc-1", { action: "list", includeDeleted: true }, undefined, undefined, ctx);
    expect(resultWithDeleted.details.tasks).toHaveLength(1);

    const resultWithoutDeleted = await toolDef.execute("tc-1", { action: "list" }, undefined, undefined, ctx);
    expect(resultWithoutDeleted.details.tasks).toHaveLength(0);
  });

  it("todo tool get action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A", description: "Desc" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "get", id: 1 }, undefined, undefined, ctx);
    expect(result.content[0].text).toContain("#1 [pending] A");
    expect(result.content[0].text).toContain("Desc");
  });

  it("todo tool get without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute("tc-1", { action: "get" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
  });

  it("todo tool get nonexistent task returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute("tc-1", { action: "get", id: 999 }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("todo tool update action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "update", id: 1, subject: "B", status: "in_progress" }, undefined, undefined, ctx);
    expect(result.content[0].text).toContain("Updated task #1: B");
    expect(result.details.tasks[0].subject).toBe("B");
    expect(result.details.tasks[0].status).toBe("in_progress");
  });

  it("todo tool update without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute("tc-1", { action: "update", subject: "B" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
  });

  it("todo tool delete action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "delete", id: 1 }, undefined, undefined, ctx);
    expect(result.content[0].text).toContain("Deleted task #1");
  });

  it("todo tool delete without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute("tc-1", { action: "delete" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
  });

  it("todo tool clear action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);
    await toolDef.execute("tc-1", { action: "create", subject: "B" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "clear" }, undefined, undefined, ctx);
    expect(result.content[0].text).toBe("All tasks cleared.");
    expect(result.details.tasks).toHaveLength(0);
  });

  it("todo tool error returns task state", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);

    const result = await toolDef.execute("tc-1", { action: "get", id: 999 }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.details.tasks).toHaveLength(1);
    expect(result.details.nextId).toBe(2);
  });

  it("/todos command lists tasks", async () => {
    await initExtension();

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
    await initExtension();

    const cmd = registeredCommands.get("todos")!;
    const ctx = createMockCtx();
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No tasks.", "info");
  });

  describe("/todos subcommands", () => {
    it("done marks task as completed", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute("tc-1", { action: "create", subject: "X" }, undefined, undefined, ctx);

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("done 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Completed task #1"),
        "info"
      );
    });

    it("start marks task as in_progress", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute("tc-1", { action: "create", subject: "X" }, undefined, undefined, ctx);

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("start 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Started task #1"),
        "info"
      );
    });

    it("delete removes task", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute("tc-1", { action: "create", subject: "X" }, undefined, undefined, ctx);

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("delete 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Deleted task #1"),
        "info"
      );
    });

    it("add creates a task", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("add New task here", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Created task #1"),
        "info"
      );
    });

    it("clear removes all tasks", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("clear", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith("All tasks cleared.", "info");
    });

    it("warns on missing id", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("done", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning"
      );
    });

    it("warns on unknown subcommand", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("foobar", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Unknown subcommand"),
        "warning"
      );
    });

    it("warns on invalid id", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("done xyz", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning"
      );
    });

    it("errors on nonexistent task", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("done 999", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
        "error"
      );
    });

    it("warns on empty add subject", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("add", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning"
      );
    });

    it("shows list subcommand explicitly", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute("tc-1", { action: "create", subject: "A" }, undefined, undefined, ctx);

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("list", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("A"),
        "info"
      );
    });
  });
});
