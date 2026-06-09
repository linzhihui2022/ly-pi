import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { TaskState } from "./state";
import { renderOverlay } from "./overlay";
import type { TaskStatus } from "./types";

export default function myTodo(pi: ExtensionAPI): void {
  let state = new TaskState();

  function refreshOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const tasks = state.list();
    const lines = renderOverlay(tasks);
    ctx.ui.setWidget("my-todo", lines.length > 0 ? lines : undefined);
  }

  pi.on("session_start", async (_event, ctx) => {
    state = TaskState.fromSession(ctx.sessionManager.getEntries());
    refreshOverlay(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    refreshOverlay(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    refreshOverlay(ctx);
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage a task list for tracking multi-step progress. Actions: create, update, list, get, delete, clear.",
    promptSnippet: "Manage tasks and track progress",
    promptGuidelines: [
      "Use todo when tracking multi-step work like research, design, and implementation.",
      "Mark tasks in_progress before beginning work on them.",
      "Mark tasks completed only when fully done.",
    ],
    parameters: Type.Object({
      action: StringEnum(["create", "update", "list", "get", "delete", "clear"] as const),
      subject: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      id: Type.Optional(Type.Number()),
      status: Type.Optional(StringEnum(["pending", "in_progress", "completed", "deleted"] as const)),
      includeDeleted: Type.Optional(Type.Boolean({ default: false })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        switch (params.action) {
          case "create": {
            if (!params.subject) throw new Error("subject is required for create");
            const task = state.create(params.subject, params.description);
            refreshOverlay(ctx);
            return {
              content: [{ type: "text", text: `Created task #${task.id}: ${task.subject}` }],
              details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId() },
            };
          }
          case "update": {
            if (params.id === undefined) throw new Error("id is required for update");
            const updates: Partial<{ subject: string; description: string; status: TaskStatus }> = {};
            if (params.subject !== undefined) updates.subject = params.subject;
            if (params.description !== undefined) updates.description = params.description;
            if (params.status !== undefined) updates.status = params.status;
            const task = state.update(params.id, updates);
            refreshOverlay(ctx);
            return {
              content: [{ type: "text", text: `Updated task #${task.id}: ${task.subject}` }],
              details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId() },
            };
          }
          case "list": {
            const tasks = state.list(params.includeDeleted ?? false);
            const lines = tasks.map((t) => `#${t.id} [${t.status}] ${t.subject}`);
            return {
              content: [{ type: "text", text: tasks.length > 0 ? lines.join("\n") : "No tasks." }],
              details: { action: params.action, params, tasks, nextId: state.getNextId() },
            };
          }
          case "get": {
            if (params.id === undefined) throw new Error("id is required for get");
            const task = state.get(params.id);
            if (!task) throw new Error(`Task ${params.id} not found`);
            return {
              content: [{
                type: "text",
                text: `#${task.id} [${task.status}] ${task.subject}${task.description ? "\n" + task.description : ""}`,
              }],
              details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId() },
            };
          }
          case "delete": {
            if (params.id === undefined) throw new Error("id is required for delete");
            const task = state.delete(params.id);
            refreshOverlay(ctx);
            return {
              content: [{ type: "text", text: `Deleted task #${task.id}: ${task.subject}` }],
              details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId() },
            };
          }
          case "clear": {
            state.clear();
            refreshOverlay(ctx);
            return {
              content: [{ type: "text", text: "All tasks cleared." }],
              details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId() },
            };
          }
          default: {
            const _exhaustive: never = params.action;
            throw new Error(`Unknown action: ${_exhaustive}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { action: params.action, params, tasks: state.list(), nextId: state.getNextId(), error: message },
          isError: true,
        };
      }
    },
  });

  pi.registerCommand("todos", {
    description: "List all tasks",
    handler: async (_args, ctx) => {
      const tasks = state.list();
      const lines = tasks.map((t) => `#${t.id} [${t.status}] ${t.subject}`);
      const text = tasks.length > 0 ? lines.join("\n") : "No tasks.";
      ctx.ui.notify(text, "info");
    },
  });
}
