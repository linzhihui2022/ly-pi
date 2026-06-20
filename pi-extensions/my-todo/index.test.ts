import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

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
  registerShortcut: vi.fn((_key: any, _options: any) => {}),
  sendUserMessage: vi.fn(),
};

const createMockCtx = (entries: any[] = []) => ({
  hasUI: true,
  ui: {
    setWidget: vi.fn((_name: string, _factory?: unknown) => {
      widgetLines.push(undefined);
    }),
    notify: vi.fn(),
    select: vi.fn(),
  },
  sessionManager: {
    getEntries: vi.fn(() => entries),
  },
  isIdle: vi.fn(() => true),
  hasPendingMessages: vi.fn(() => false),
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
  it("registers todo tool", async () => {
    await initExtension();
    expect(mockPi.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "todo" }),
    );
  });

  it("registers /todos command", async () => {
    await initExtension();
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "todos",
      expect.any(Object),
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
      expect.any(Function),
    );
    expect(ctx.ui.setWidget).not.toHaveBeenCalledWith(
      "my-todo-completed",
      expect.any(Function),
    );
  });

  it("session_start hides widget when no tasks", async () => {
    await initExtension();

    const handler = registeredEvents.get("session_start")!;
    const ctx = createMockCtx([]);
    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo-completed",
      undefined,
    );
  });

  it("session_start renders both widgets when active and completed tasks exist", async () => {
    await initExtension();

    const handler = registeredEvents.get("session_start")!;
    const ctx = createMockCtx([
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            tasks: [
              { id: 1, subject: "Active task", status: "in_progress" },
              { id: 2, subject: "Done task", status: "completed" },
            ],
            nextId: 3,
          },
        },
      },
    ]);

    await handler({}, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo",
      expect.any(Function),
    );
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo-completed",
      expect.any(Function),
    );
  });

  it("session_start hides completed widget when no completed tasks", async () => {
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
      expect.any(Function),
    );
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo-completed",
      undefined,
    );
  });

  it("todo tool update hides active widget and shows completed when task marked done", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );
    vi.clearAllMocks();

    await toolDef.execute(
      "tc-1",
      { action: "update", id: 1, status: "completed" },
      undefined,
      undefined,
      ctx,
    );

    expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-todo", undefined);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo-completed",
      expect.any(Function),
    );
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
    expect(ctx.ui.setWidget).toHaveBeenCalledTimes(setWidgetCalls + 3);
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
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "my-todo-completed",
      undefined,
    );
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
      ctx,
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
      ctx,
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
      ctx,
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
      ctx,
    );

    expect(result.isError).toBe(true);
  });

  it("todo tool list action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "B" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "list" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toContain("○ #1 A");
    expect(result.content[0].text).toContain("○ #2 B");
  });

  it("todo tool list with includeDeleted", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );
    await toolDef.execute(
      "tc-1",
      { action: "delete", id: 1 },
      undefined,
      undefined,
      ctx,
    );

    const resultWithDeleted = await toolDef.execute(
      "tc-1",
      { action: "list", includeDeleted: true },
      undefined,
      undefined,
      ctx,
    );
    expect(resultWithDeleted.details.tasks).toHaveLength(1);

    const resultWithoutDeleted = await toolDef.execute(
      "tc-1",
      { action: "list" },
      undefined,
      undefined,
      ctx,
    );
    expect(resultWithoutDeleted.details.tasks).toHaveLength(0);
  });

  it("todo tool get action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A", description: "Desc" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "get", id: 1 },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toContain("#1 [pending] A");
    expect(result.content[0].text).toContain("Desc");
  });

  it("todo tool get without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "get" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("todo tool get nonexistent task returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "get", id: 999 },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("todo tool update action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "update", id: 1, subject: "B", status: "in_progress" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toContain("Updated task #1: B");
    expect(result.details.tasks[0].subject).toBe("B");
    expect(result.details.tasks[0].status).toBe("in_progress");
  });

  it("todo tool update without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "update", subject: "B" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("todo tool delete action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "delete", id: 1 },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toContain("Deleted task #1");
  });

  it("todo tool delete without id returns error", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    const result = await toolDef.execute(
      "tc-1",
      { action: "delete" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("todo tool clear action works", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "B" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "clear" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.content[0].text).toBe("All tasks cleared.");
    expect(result.details.tasks).toHaveLength(0);
  });

  it("todo tool error returns task state", async () => {
    await initExtension();

    const toolDef = registeredTools[0];
    const ctx = createMockCtx();
    await toolDef.execute(
      "tc-1",
      { action: "create", subject: "A" },
      undefined,
      undefined,
      ctx,
    );

    const result = await toolDef.execute(
      "tc-1",
      { action: "get", id: 999 },
      undefined,
      undefined,
      ctx,
    );
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
      ctx,
    );

    const cmd = registeredCommands.get("todos")!;
    await cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Task A"),
      "info",
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
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "X" },
        undefined,
        undefined,
        ctx,
      );

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("done 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Completed task #1"),
        "info",
      );
    });

    it("start marks task as in_progress", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "X" },
        undefined,
        undefined,
        ctx,
      );

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("start 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Started task #1"),
        "info",
      );
    });

    it("delete removes task", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "X" },
        undefined,
        undefined,
        ctx,
      );

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("delete 1", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Deleted task #1"),
        "info",
      );
    });

    it("add creates a task", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("add New task here", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Created task #1"),
        "info",
      );
    });

    it("clear removes all tasks", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "A" },
        undefined,
        undefined,
        ctx,
      );

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
        "warning",
      );
    });

    it("warns on unknown subcommand", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("foobar", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Unknown subcommand"),
        "warning",
      );
    });

    it("warns on invalid id", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("done xyz", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning",
      );
    });

    it("errors on nonexistent task", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("done 999", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
        "error",
      );
    });

    it("warns on empty add subject", async () => {
      await initExtension();

      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("add", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning",
      );
    });

    it("shows list subcommand explicitly", async () => {
      await initExtension();

      const toolDef = registeredTools[0];
      const ctx = createMockCtx();
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "A" },
        undefined,
        undefined,
        ctx,
      );

      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("list", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("A"),
        "info",
      );
    });
  });

  describe("plan mode", () => {
    it("registers Ctrl+Shift+P shortcut", async () => {
      await initExtension();
      expect(mockPi.registerShortcut).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
      );
    });

    it("registers before_agent_start event", async () => {
      await initExtension();
      expect(registeredEvents.has("before_agent_start")).toBe(true);
    });

    it("registers tool_call event", async () => {
      await initExtension();
      expect(registeredEvents.has("tool_call")).toBe(true);
    });

    it("registers agent_end event", async () => {
      await initExtension();
      expect(registeredEvents.has("agent_end")).toBe(true);
    });

    it("/todos plan enters planning mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      // Verify via todo tool state - create a task, check details
      const toolDef = registeredTools[0];
      const result = await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Plan step 1" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("planning");
      // Widget should be set for plan mode
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("/todos execute enters executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Enter planning first
      await cmd.handler("plan", ctx);
      // Create a task
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );
      // Execute
      await cmd.handler("execute", ctx);
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("executing");
    });

    it("/todos reset clears tasks and exits plan mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Enter planning
      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );
      // Reset
      await cmd.handler("reset", ctx);
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.tasks).toHaveLength(0);
      expect(result.details.planMode).toBe(false);
      expect(result.details.planPhase).toBe("idle");
    });

    it("Ctrl+Shift+P toggles plan mode", async () => {
      await initExtension();
      const shortcutHandler = mockPi.registerShortcut.mock.calls[0][1].handler;
      const ctx = createMockCtx();
      await shortcutHandler(ctx);
      // Toggle on
      const toolDef = registeredTools[0];
      const result1 = await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );
      expect(result1.details.planMode).toBe(true);
      expect(result1.details.planPhase).toBe("planning");
      // Toggle off
      await shortcutHandler(ctx);
      const result2 = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result2.details.planMode).toBe(false);
    });
  });

  describe("plan mode tool whitelist", () => {
    async function enterPlanMode() {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      return registeredEvents.get("tool_call")!;
    }

    const blockedTools = ["edit", "write"];
    const allowedTools = [
      "read",
      "bash",
      "grep",
      "find",
      "ls",
      "web_search",
      "web_fetch",
      "ask_user_question",
      "todo",
    ];

    for (const toolName of blockedTools) {
      it(`blocks ${toolName} tool in planning mode`, async () => {
        const handler = await enterPlanMode();
        const ctx = createMockCtx();
        const event = {
          type: "tool_call" as const,
          toolCallId: "tc-1",
          toolName,
          input: {} as any,
        };
        const result = await handler(event, ctx);
        expect(result).toEqual({
          block: true,
          reason: "Plan mode: only planning tools are allowed",
        });
      });
    }

    for (const toolName of allowedTools) {
      it(`allows ${toolName} tool in planning mode`, async () => {
        const handler = await enterPlanMode();
        const ctx = createMockCtx();
        const event = {
          type: "tool_call" as const,
          toolCallId: "tc-1",
          toolName,
          input: {} as any,
        };
        const result = await handler(event, ctx);
        expect(result).toBeUndefined();
      });
    }

    it("allows all tools in executing mode", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);
      const handler = registeredEvents.get("tool_call")!;
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "edit",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });

    it("allows all tools when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("tool_call")!;
      const ctx = createMockCtx();
      const event = {
        type: "tool_call" as const,
        toolCallId: "tc-1",
        toolName: "edit",
        input: {} as any,
      };
      const result = await handler(event, ctx);
      expect(result).toBeUndefined();
    });
  });

  describe("before_agent_start", () => {
    it("injects planning system prompt in planning phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.message.display).toBe(false);
      expect(result.message.content).toContain("plan mode");
      expect(result.message.content).toContain("planning tools");
    });

    it("injects executing system prompt in executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.message.display).toBe(false);
      expect(result.message.content).toContain("executing");
      expect(result.message.content).toContain("todo");
    });

    it("does not inject when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("before_agent_start")!;
      const ctx = createMockCtx();
      const result = await handler({}, ctx);
      expect(result).toBeUndefined();
    });
  });

  describe("auto-exit plan mode on completion", () => {
    it("exits plan mode when all tasks are completed in executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();

      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );
      await cmd.handler("execute", ctx);

      // Mark task as completed
      await toolDef.execute(
        "tc-1",
        { action: "update", id: 1, status: "completed" },
        undefined,
        undefined,
        ctx,
      );

      vi.clearAllMocks();
      const handler = registeredEvents.get("turn_end")!;
      await handler({}, ctx);

      // Should have exited plan mode and refreshed widgets
      expect(ctx.ui.setWidget).toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Plan complete. All tasks finished.",
        "info",
      );

      // Verify subsequent tool calls are no longer in plan mode
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.planMode).toBe(false);
      expect(result.details.planPhase).toBe("idle");
    });

    it("does not exit plan mode when tasks are still active", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();

      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );
      await cmd.handler("execute", ctx);

      vi.clearAllMocks();
      const handler = registeredEvents.get("turn_end")!;
      await handler({}, ctx);

      expect(ctx.ui.notify).not.toHaveBeenCalledWith(
        "Plan complete. All tasks finished.",
        "info",
      );

      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("executing");
    });

    it("does not exit plan mode when there are no tasks", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();

      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);

      vi.clearAllMocks();
      const handler = registeredEvents.get("turn_end")!;
      await handler({}, ctx);

      expect(ctx.ui.notify).not.toHaveBeenCalledWith(
        "Plan complete. All tasks finished.",
        "info",
      );

      const toolDef = registeredTools[0];
      const result = await toolDef.execute(
        "tc-1",
        { action: "list" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.planMode).toBe(true);
      expect(result.details.planPhase).toBe("executing");
    });
  });

  describe("agent_end dialog", () => {
    it("shows select dialog in planning mode with tasks", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      // Set up state in planning mode with tasks
      await cmd.handler("plan", ctx);
      const toolDef = registeredTools[0];
      await toolDef.execute(
        "tc-1",
        { action: "create", subject: "Step 1" },
        undefined,
        undefined,
        ctx,
      );

      ctx.ui.select = vi.fn().mockResolvedValue("Execute plan");

      const handler = registeredEvents.get("agent_end")!;
      await handler({}, ctx);

      expect(ctx.ui.select).toHaveBeenCalledWith(
        "Plan Complete",
        expect.arrayContaining([
          "Execute plan",
          "Continue planning",
          "Discard plan",
        ]),
      );
    });

    it("does not show dialog when not in plan mode", async () => {
      await initExtension();
      const handler = registeredEvents.get("agent_end")!;
      const ctx = createMockCtx();
      ctx.ui.select = vi.fn();
      await handler({}, ctx);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it("does not show dialog when in executing phase", async () => {
      await initExtension();
      const cmd = registeredCommands.get("todos")!;
      const ctx = createMockCtx();
      await cmd.handler("plan", ctx);
      await cmd.handler("execute", ctx);
      ctx.ui.select = vi.fn();

      const handler = registeredEvents.get("agent_end")!;
      await handler({}, ctx);
      expect(ctx.ui.select).not.toHaveBeenCalled();
    });
  });

  describe("/goal command", () => {
    it("registers goal tool", async () => {
      await initExtension();
      expect(mockPi.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: "goal" }),
      );
    });

    it("registers /goal command", async () => {
      await initExtension();
      expect(mockPi.registerCommand).toHaveBeenCalledWith(
        "goal",
        expect.any(Object),
      );
    });

    it("sets goal", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Goal set"),
        "info",
      );
    });

    it("rejects empty objective", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("   ", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Usage"),
        "warning",
      );
    });

    it("shows status", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      ctx.ui.notify.mockClear();
      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Refactor auth"),
        "info",
      );
    });

    it("pauses and resumes", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      await cmd.handler("pause", ctx);
      ctx.ui.notify.mockClear();
      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("paused"),
        "info",
      );
      await cmd.handler("resume", ctx);
      ctx.ui.notify.mockClear();
      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("active"),
        "info",
      );
    });

    it("clears goal", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      await cmd.handler("clear", ctx);
      ctx.ui.notify.mockClear();
      await cmd.handler("", ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith("No active goal.", "info");
    });
  });

  describe("goal tool", () => {
    async function getGoalTool() {
      await initExtension();
      return registeredTools.find((t) => t.name === "goal")!;
    }

    it("guidelines forbid asking the user for confirmation while active", async () => {
      await initExtension();
      const tool = registeredTools.find((t) => t.name === "goal")!;
      const guidelines = tool.promptGuidelines.join(" ");
      expect(guidelines).toMatch(/do not ask.*user/i);
      expect(guidelines).toMatch(/confirmation|confirm/i);
    });

    it("evaluate updates evidence", async () => {
      const tool = await getGoalTool();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);

      const result = await tool.execute(
        "tc-1",
        {
          action: "evaluate",
          lastEvidence: "Tests pass",
          nextAction: "Deploy",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(result.content[0].text).toContain("Tests pass");
      expect(result.details.goal.lastEvidence).toBe("Tests pass");
    });

    it("mark_complete requires evidence", async () => {
      const tool = await getGoalTool();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);

      const result = await tool.execute(
        "tc-1",
        { action: "mark_complete" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Evidence is required");
    });

    it("mark_complete completes goal", async () => {
      const tool = await getGoalTool();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);

      const result = await tool.execute(
        "tc-1",
        { action: "mark_complete", evidence: "CI green" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.goal.status).toBe("completed");
    });

    it("mark_blocked requires reason", async () => {
      const tool = await getGoalTool();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);

      const result = await tool.execute(
        "tc-1",
        { action: "mark_blocked" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Reason is required");
    });

    it("mark_blocked blocks goal", async () => {
      const tool = await getGoalTool();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);

      const result = await tool.execute(
        "tc-1",
        { action: "mark_blocked", reason: "API down" },
        undefined,
        undefined,
        ctx,
      );
      expect(result.details.goal.status).toBe("blocked");
    });
  });

  describe("before_agent_start goal prompt", () => {
    it("injects active goal context", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result).toBeDefined();
      expect(result.message.display).toBe(false);
      expect(result.message.content).toContain("Refactor auth");
      expect(result.message.content).toContain("Use the goal tool");
    });

    it("active goal prompt forbids asking the user", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result.message.content).toMatch(/do not ask.*user/i);
      expect(result.message.content).toMatch(/confirmation|confirm/i);
      expect(result.message.content).toMatch(/blocked/i);
    });

    it("does not inject when goal is idle", async () => {
      await initExtension();
      const handler = registeredEvents.get("before_agent_start")!;
      const ctx = createMockCtx();
      const result = await handler({}, ctx);
      expect(result).toBeUndefined();
    });

    it("injects summary prompt for completed goal", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      const tool = registeredTools.find((t) => t.name === "goal")!;
      await tool.execute(
        "tc-1",
        { action: "mark_complete", evidence: "Done" },
        undefined,
        undefined,
        ctx,
      );

      const handler = registeredEvents.get("before_agent_start")!;
      const result = await handler({}, ctx);
      expect(result.message.content).toContain("completed");
      expect(result.message.content).toContain("Key evidence");
    });
  });

  describe("agent_end auto-continue", () => {
    async function setupActiveGoal() {
      await initExtension();
      const ctx = createMockCtx();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("Refactor auth", ctx);
      return ctx;
    }

    function fireTurnEnd(ctx: any, toolCount: number) {
      const handler = registeredEvents.get("turn_end")!;
      return handler(
        {
          type: "turn_end",
          turnIndex: 1,
          message: {},
          toolResults: Array(toolCount).fill({}),
        },
        ctx,
      );
    }

    it("sends follow-up when active, idle, and tools ran", async () => {
      const ctx = await setupActiveGoal();
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("Continue working toward the goal"),
        { deliverAs: "followUp" },
      );
    });

    it("follow-up message forbids asking the user for confirmation", async () => {
      const ctx = await setupActiveGoal();
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      const message = mockPi.sendUserMessage.mock.calls[0][0];
      expect(message).toMatch(/do not ask.*user/i);
      expect(message).toMatch(/confirmation|confirm/i);
      expect(message).toMatch(/mark_blocked/i);
    });

    it("includes progress entries in follow-up", async () => {
      const ctx = await setupActiveGoal();
      const tool = registeredTools.find((t) => t.name === "goal")!;
      await tool.execute(
        "tc-1",
        {
          action: "evaluate",
          lastEvidence: "Read files",
          nextAction: "Edit config",
        },
        undefined,
        undefined,
        ctx,
      );
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("Progress so far:"),
        { deliverAs: "followUp" },
      );
    });

    it("sends custom nextAction when set", async () => {
      const ctx = await setupActiveGoal();
      const tool = registeredTools.find((t) => t.name === "goal")!;
      await tool.execute(
        "tc-1",
        { action: "evaluate", nextAction: "Run migration" },
        undefined,
        undefined,
        ctx,
      );
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("Run migration"),
        { deliverAs: "followUp" },
      );
    });

    it("does not auto-continue when paused", async () => {
      const ctx = await setupActiveGoal();
      const cmd = registeredCommands.get("goal")!;
      await cmd.handler("pause", ctx);
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("does not auto-continue when completed", async () => {
      const ctx = await setupActiveGoal();
      const tool = registeredTools.find((t) => t.name === "goal")!;
      await tool.execute(
        "tc-1",
        { action: "mark_complete", evidence: "Done" },
        undefined,
        undefined,
        ctx,
      );
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("does not auto-continue when blocked", async () => {
      const ctx = await setupActiveGoal();
      const tool = registeredTools.find((t) => t.name === "goal")!;
      await tool.execute(
        "tc-1",
        { action: "mark_blocked", reason: "Stuck" },
        undefined,
        undefined,
        ctx,
      );
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("does not auto-continue when no tools ran", async () => {
      const ctx = await setupActiveGoal();
      await fireTurnEnd(ctx, 0);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("does not auto-continue when pending messages exist", async () => {
      const ctx = await setupActiveGoal();
      ctx.hasPendingMessages = vi.fn(() => true);
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });

    it("does not auto-continue in planning phase", async () => {
      const ctx = await setupActiveGoal();
      const cmd = registeredCommands.get("todos")!;
      await cmd.handler("plan", ctx);
      await fireTurnEnd(ctx, 1);

      const handler = registeredEvents.get("agent_end")!;
      await handler({ type: "agent_end", messages: [] }, ctx);

      expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
    });
  });

  describe("goal widget", () => {
    it("renders goal widget after set", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalledWith(
        "my-goal",
        expect.any(Function),
      );
    });

    it("clears goal widget after clear", async () => {
      await initExtension();
      const cmd = registeredCommands.get("goal")!;
      const ctx = createMockCtx();
      await cmd.handler("Refactor auth", ctx);
      ctx.ui.setWidget.mockClear();
      await cmd.handler("clear", ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalledWith("my-goal", undefined);
    });
  });
});
