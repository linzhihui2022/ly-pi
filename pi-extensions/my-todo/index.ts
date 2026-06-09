import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { TaskState } from "./state";
import { renderOverlay } from "./overlay";
import type { Task, TaskStatus } from "./types";

const STATUS_SYMBOLS: Record<Task["status"], string> = {
  pending: "○",
  in_progress: "●",
  completed: "✓",
  deleted: "🗑",
};

function formatTaskLine(task: Task): string {
  return `${STATUS_SYMBOLS[task.status]} #${task.id} ${task.subject}`;
}

export default function myTodo(pi: ExtensionAPI): void {
  let state = new TaskState();

  function refreshOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const tasks = state.list();
    if (tasks.length === 0) {
      ctx.ui.setWidget("my-todo", undefined);
      return;
    }
    ctx.ui.setWidget("my-todo", (_tui, theme) => ({
      render: () => renderOverlay(tasks, theme),
      invalidate: () => {},
    }));
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
            const lines = tasks.map(formatTaskLine);
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
    description: "Manage tasks: /todos [list|done|start|delete|clear|add] [args]",
    getArgumentCompletions: (prefix: string) => {
      const trimmed = prefix.trimStart();
      const parts = trimmed.split(/\s+/);

      if (parts.length <= 1) {
        const subs: { value: string; label: string; description: string }[] = [
          { value: "list", label: "list", description: "List all tasks" },
          { value: "done", label: "done", description: "Mark a task as completed" },
          { value: "start", label: "start", description: "Mark a task as in progress" },
          { value: "delete", label: "delete", description: "Delete a task" },
          { value: "clear", label: "clear", description: "Clear all tasks" },
          { value: "add", label: "add", description: "Add a new task" },
        ];
        const p = parts[0] ?? "";
        const filtered = subs
          .filter((s) => s.value.startsWith(p))
          .map((s) => ({ value: s.value, label: s.label, description: s.description }));
        return filtered.length > 0 ? filtered : null;
      }

      const sub = parts[0];
      if (sub === "done" || sub === "start" || sub === "delete") {
        const tasks = state.list();
        const idPrefix = parts[1] ?? "";
        const filtered = tasks
          .filter((t) => String(t.id).startsWith(idPrefix))
          .map((t) => ({
            value: String(t.id),
            label: `#${t.id} ${t.subject}`,
            description: t.status,
          }));
        return filtered.length > 0 ? filtered : null;
      }

      return null;
    },
    handler: async (args, ctx) => {
      const trimmed = (args ?? "").trim();
      const [sub, ...rest] = trimmed.split(/\s+/);

      const listAll = () => {
        const tasks = state.list();
        const lines = tasks.map(formatTaskLine);
        ctx.ui.notify(tasks.length > 0 ? lines.join("\n") : "No tasks.", "info");
      };

      // No args or "list" → show all
      if (!trimmed || sub === "list") {
        listAll();
        return;
      }

      if (sub === "clear") {
        state.clear();
        refreshOverlay(ctx);
        ctx.ui.notify("All tasks cleared.", "info");
        return;
      }

      if (sub === "add") {
        const subject = rest.join(" ").trim();
        if (!subject) {
          ctx.ui.notify("Usage: /todos add <subject>", "warning");
          return;
        }
        const task = state.create(subject);
        refreshOverlay(ctx);
        ctx.ui.notify(`Created task #${task.id}: ${task.subject}`, "info");
        return;
      }

      const validMutations = ["done", "start", "delete"] as const;
      if (!validMutations.includes(sub as (typeof validMutations)[number])) {
        ctx.ui.notify(`Unknown subcommand: ${sub}\nUsage: /todos [list|done|start|delete|clear|add]`, "warning");
        return;
      }

      const parseId = (raw: string | undefined): number | null => {
        if (!raw) return null;
        const n = Number(raw);
        return Number.isNaN(n) ? null : n;
      };

      const id = parseId(rest[0]);
      if (id === null) {
        ctx.ui.notify(`Usage: /todos ${sub} <id>`, "warning");
        return;
      }

      if (sub === "done") {
        try {
          const task = state.update(id, { status: "completed" });
          refreshOverlay(ctx);
          ctx.ui.notify(`Completed task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }

      if (sub === "start") {
        try {
          const task = state.update(id, { status: "in_progress" });
          refreshOverlay(ctx);
          ctx.ui.notify(`Started task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }

      if (sub === "delete") {
        try {
          const task = state.delete(id);
          refreshOverlay(ctx);
          ctx.ui.notify(`Deleted task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
        return;
      }
    },
  });
}
