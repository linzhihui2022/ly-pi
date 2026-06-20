import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Key } from "@earendil-works/pi-tui";
import { TaskState } from "./state";
import {
  renderActiveOverlay,
  renderCompletedOverlay,
  renderPlanOverlay,
} from "./overlay";
import { GoalState } from "./goal-state";
import { renderGoalOverlay } from "./goal-overlay";
import { parseGoalCommand } from "./goal-command";
import { createGoalCompleteTool } from "./goal-complete";
import {
  MAX_CONTINUATIONS,
  buildGoalSystemPrompt,
  buildGoalPrompt,
  buildObjectiveUpdatedPrompt,
  buildResumePrompt,
  buildContinuePrompt,
  continuationMarker,
  extractContinuationMarker,
  formatStatus,
  goalSummary,
} from "./goal-logic";
import type { ActiveGoal, Task, TaskStatus } from "./types";

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
  let goalState = new GoalState();

  let continuationPending:
    | { goalId: string; marker: string }
    | undefined;
  let continuationDelivered:
    | { goalId: string; marker: string }
    | undefined;
  const cancelledContinuationMarkers = new Set<string>();

  function persistGoal(goal: ActiveGoal | null): void {
    pi.appendEntry("goal-state", { goal });
  }

  function updateStatus(ctx: ExtensionContext, goal: ActiveGoal | null): void {
    ctx.ui.setStatus("my-todo-goal", formatStatus(goal ?? undefined));
  }

  function clearStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus("my-todo-goal", "complete");
    setTimeout(() => {
      ctx.ui.setStatus("my-todo-goal", undefined);
    }, 8000);
  }

  function clearContinuationTracking(): void {
    continuationPending = undefined;
    continuationDelivered = undefined;
    cancelledContinuationMarkers.clear();
  }

  function cancelContinuationPending(): void {
    if (continuationPending) {
      cancelledContinuationMarkers.add(continuationPending.marker);
      continuationPending = undefined;
    }
  }

  function isCancelledContinuationPrompt(prompt: string): boolean {
    const marker = extractContinuationMarker(prompt);
    if (!marker) return false;
    return cancelledContinuationMarkers.has(marker);
  }

  function consumeCancelledContinuationPrompt(text: string): boolean {
    const marker = extractContinuationMarker(text);
    if (!marker) return false;
    if (cancelledContinuationMarkers.has(marker)) {
      cancelledContinuationMarkers.delete(marker);
      return true;
    }
    return false;
  }

  function markContinuationDelivered(prompt: string): void {
    const marker = extractContinuationMarker(prompt);
    if (!continuationPending) return;
    if (marker === continuationPending.marker) {
      continuationDelivered = continuationPending;
    } else {
      // A different prompt started before the pending continuation was
      // delivered; suppress the stale follow-up if it ever arrives.
      cancelledContinuationMarkers.add(continuationPending.marker);
    }
    continuationPending = undefined;
  }

  function sendContinuationPrompt(pi: ExtensionAPI, _ctx: ExtensionContext, goal: ActiveGoal): void {
    const marker = continuationMarker(goal);
    pi.sendUserMessage(buildContinuePrompt(goal, marker), {
      deliverAs: "followUp",
    });
    continuationPending = { goalId: goal.id, marker };
  }

  function sendGoalPrompt(pi: ExtensionAPI, _ctx: ExtensionContext, goal: ActiveGoal): void {
    pi.sendUserMessage(buildGoalPrompt(goal), { deliverAs: "followUp" });
  }

  function sendObjectiveUpdatedPrompt(pi: ExtensionAPI, _ctx: ExtensionContext, goal: ActiveGoal): void {
    pi.sendUserMessage(buildObjectiveUpdatedPrompt(goal), { deliverAs: "followUp" });
  }

  function sendResumePrompt(pi: ExtensionAPI, _ctx: ExtensionContext, goal: ActiveGoal): void {
    pi.sendUserMessage(buildResumePrompt(goal), { deliverAs: "followUp" });
  }

  function clearActiveGoal(ctx: ExtensionContext): void {
    goalState.clear();
    cancelContinuationPending();
    persistGoal(null);
    updateStatus(ctx, null);
    refreshWidgets(ctx);
  }

  function refreshWidgets(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const tasks = state.list();
    const planMode = state.getPlanMode();
    const planPhase = state.getPlanPhase();

    if (planMode) {
      // In plan mode, use a single plan overlay widget
      const active = tasks.filter(
        (t) => t.status === "pending" || t.status === "in_progress",
      );
      if (active.length === 0) {
        ctx.ui.setWidget("my-todo", undefined);
      } else {
        ctx.ui.setWidget("my-todo", (_tui, theme) => ({
          render: () => renderPlanOverlay(active, planPhase, theme),
          invalidate: () => {},
        }));
      }
      ctx.ui.setWidget("my-todo-completed", undefined);
      return;
    }

    const active = tasks.filter(
      (t) => t.status === "pending" || t.status === "in_progress",
    );
    const completed = tasks.filter((t) => t.status === "completed");

    if (active.length === 0) {
      ctx.ui.setWidget("my-todo", undefined);
    } else {
      ctx.ui.setWidget("my-todo", (_tui, theme) => ({
        render: () => renderActiveOverlay(active, theme),
        invalidate: () => {},
      }));
    }

    if (completed.length === 0) {
      ctx.ui.setWidget("my-todo-completed", undefined);
    } else {
      ctx.ui.setWidget("my-todo-completed", (_tui, theme) => ({
        render: () => renderCompletedOverlay(completed, theme),
        invalidate: () => {},
      }));
    }

    const goal = goalState.get();
    if (goal) {
      ctx.ui.setWidget("my-goal", (_tui, theme) => ({
        render: () => renderGoalOverlay(goal, theme),
        invalidate: () => {},
      }));
    } else {
      ctx.ui.setWidget("my-goal", undefined);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    state = TaskState.fromSession(ctx.sessionManager.getEntries());
    goalState = GoalState.fromSession(ctx.sessionManager.getEntries());
    clearContinuationTracking();
    const goal = goalState.get();
    updateStatus(ctx, goal);
    if (goal?.status === "paused" && ctx.hasUI) {
      const choice = await ctx.ui.select("Goal is paused", [
        "Resume goal",
        "Clear goal",
      ]);
      if (choice === "Resume goal") {
        goalState.resume();
        updateStatus(ctx, goalState.get());
        persistGoal(goalState.get());
        sendResumePrompt(pi, ctx, goalState.get()!);
      } else {
        clearActiveGoal(ctx);
      }
    }
    refreshWidgets(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    refreshWidgets(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    refreshWidgets(ctx);

    // Auto-exit plan mode when all tasks are completed during execution
    if (state.getPlanMode() && state.getPlanPhase() === "executing") {
      const tasks = state.list();
      if (tasks.length > 0 && tasks.every((t) => t.status === "completed")) {
        state.setPlanMode(false, "idle");
        refreshWidgets(ctx);
        ctx.ui.notify("Plan complete. All tasks finished.", "info");
      }
    }
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a task list for tracking multi-step progress. Actions: create, update, list, get, delete, clear.",
    promptSnippet: "Manage tasks and track progress",
    promptGuidelines: [
      "Use todo when tracking multi-step work like research, design, and implementation.",
      "Mark tasks in_progress before beginning work on them.",
      "Mark tasks completed only when fully done.",
    ],
    parameters: Type.Object({
      action: StringEnum([
        "create",
        "update",
        "list",
        "get",
        "delete",
        "clear",
      ] as const),
      subject: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      id: Type.Optional(Type.Number()),
      status: Type.Optional(
        StringEnum(["pending", "in_progress", "completed", "deleted"] as const),
      ),
      includeDeleted: Type.Optional(Type.Boolean({ default: false })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        switch (params.action) {
          case "create": {
            if (!params.subject)
              throw new Error("subject is required for create");
            const task = state.create(params.subject, params.description);
            refreshWidgets(ctx);
            return {
              content: [
                {
                  type: "text",
                  text: `Created task #${task.id}: ${task.subject}`,
                },
              ],
              details: {
                action: params.action,
                params,
                tasks: state.list(),
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
            };
          }
          case "update": {
            if (params.id === undefined)
              throw new Error("id is required for update");
            const updates: Partial<{
              subject: string;
              description: string;
              status: TaskStatus;
            }> = {};
            if (params.subject !== undefined) updates.subject = params.subject;
            if (params.description !== undefined)
              updates.description = params.description;
            if (params.status !== undefined) updates.status = params.status;
            const task = state.update(params.id, updates);
            refreshWidgets(ctx);
            return {
              content: [
                {
                  type: "text",
                  text: `Updated task #${task.id}: ${task.subject}`,
                },
              ],
              details: {
                action: params.action,
                params,
                tasks: state.list(),
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
            };
          }
          case "list": {
            const tasks = state.list(params.includeDeleted ?? false);
            const lines = tasks.map(formatTaskLine);
            return {
              content: [
                {
                  type: "text",
                  text: tasks.length > 0 ? lines.join("\n") : "No tasks.",
                },
              ],
              details: {
                action: params.action,
                params,
                tasks,
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
            };
          }
          case "get": {
            if (params.id === undefined)
              throw new Error("id is required for get");
            const task = state.get(params.id);
            if (!task) throw new Error(`Task ${params.id} not found`);
            return {
              content: [
                {
                  type: "text",
                  text: `#${task.id} [${task.status}] ${task.subject}${task.description ? "\n" + task.description : ""}`,
                },
              ],
              details: {
                action: params.action,
                params,
                tasks: state.list(),
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
            };
          }
          case "delete": {
            if (params.id === undefined)
              throw new Error("id is required for delete");
            const task = state.delete(params.id);
            refreshWidgets(ctx);
            return {
              content: [
                {
                  type: "text",
                  text: `Deleted task #${task.id}: ${task.subject}`,
                },
              ],
              details: {
                action: params.action,
                params,
                tasks: state.list(),
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
            };
          }
          case "clear": {
            state.clear();
            refreshWidgets(ctx);
            return {
              content: [{ type: "text", text: "All tasks cleared." }],
              details: {
                action: params.action,
                params,
                tasks: state.list(),
                nextId: state.getNextId(),
                planMode: state.getPlanMode(),
                planPhase: state.getPlanPhase(),
              },
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
          details: {
            action: params.action,
            params,
            tasks: state.list(),
            nextId: state.getNextId(),
            planMode: state.getPlanMode(),
            planPhase: state.getPlanPhase(),
            error: message,
          },
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "goal",
    label: "Goal",
    description:
      "Track long-horizon objectives and autonomous progress. Actions: evaluate, mark_blocked.",
    promptSnippet: "Track long-term goals and evidence of completion",
    promptGuidelines: [
      "Use the goal tool to record evidence, update the next step, and mark the goal blocked when no valid path remains.",
      "Call mark_blocked when no valid path remains and explain why.",
      "While the goal is active, do not ask the user for confirmation or clarification. Proceed autonomously or mark_blocked.",
    ],
    parameters: Type.Object({
      action: StringEnum(["evaluate", "mark_blocked"] as const),
      lastEvidence: Type.Optional(Type.String()),
      nextAction: Type.Optional(Type.String()),
      status: Type.Optional(
        StringEnum(["active", "paused"] as const),
      ),
      reason: Type.Optional(Type.String()),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        switch (params.action) {
          case "evaluate": {
            const goal = goalState.evaluate(
              params.lastEvidence,
              params.nextAction,
              params.status as import("./types").GoalStatus | undefined,
            );
            refreshWidgets(ctx);
            return {
              content: [
                {
                  type: "text",
                  text: `Goal updated. Status: ${goal.status}, evidence: ${goal.lastEvidence || "(none)"}, next: ${goal.nextAction || "(none)"}`,
                },
              ],
              details: { action: params.action, status: goal.status },
            };
          }
          case "mark_blocked": {
            const goal = goalState.markBlocked(params.reason ?? "");
            refreshWidgets(ctx);
            return {
              content: [
                { type: "text", text: `Goal blocked: ${goal.blocker}` },
              ],
              details: { action: params.action, status: goal.status },
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
          details: {
            action: params.action,
            status: goalState.getStatus(),
            error: message,
          },
          isError: true,
        };
      }
    },
  });

  pi.registerTool(
    createGoalCompleteTool(goalState, {
      persistGoal,
      clearStatus,
      notify: (ctx, message, level) => ctx.ui.notify(message, level),
    }),
  );

  pi.registerCommand("todos", {
    description:
      "Manage tasks: /todos [list|done|start|delete|clear|add|plan|execute|reset] [args]",
    getArgumentCompletions: (prefix: string) => {
      const trimmed = prefix.trimStart();
      const parts = trimmed.split(/\s+/);

      if (parts.length <= 1) {
        const subs: { value: string; label: string; description: string }[] = [
          { value: "list", label: "list", description: "List all tasks" },
          {
            value: "done",
            label: "done",
            description: "Mark a task as completed",
          },
          {
            value: "start",
            label: "start",
            description: "Mark a task as in progress",
          },
          { value: "delete", label: "delete", description: "Delete a task" },
          { value: "clear", label: "clear", description: "Clear all tasks" },
          { value: "add", label: "add", description: "Add a new task" },
          { value: "plan", label: "plan", description: "Enter plan mode" },
          {
            value: "execute",
            label: "execute",
            description: "Start executing the plan",
          },
          {
            value: "reset",
            label: "reset",
            description: "Clear all tasks and exit plan mode",
          },
        ];
        const p = parts[0] ?? "";
        const filtered = subs
          .filter((s) => s.value.startsWith(p))
          .map((s) => ({
            value: s.value,
            label: s.label,
            description: s.description,
          }));
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
        ctx.ui.notify(
          tasks.length > 0 ? lines.join("\n") : "No tasks.",
          "info",
        );
      };

      // No args or "list" → show all
      if (!trimmed || sub === "list") {
        listAll();
        return;
      }

      if (sub === "clear") {
        state.clear();
        refreshWidgets(ctx);
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
        refreshWidgets(ctx);
        ctx.ui.notify(`Created task #${task.id}: ${task.subject}`, "info");
        return;
      }

      if (sub === "plan") {
        if (state.getPlanMode() && state.getPlanPhase() === "planning") {
          ctx.ui.notify("Already in plan mode.", "info");
          return;
        }
        state.setPlanMode(true, "planning");
        refreshWidgets(ctx);
        ctx.ui.notify(
          "Plan mode enabled. Only planning tools are available.",
          "info",
        );
        return;
      }

      if (sub === "execute") {
        if (!state.getPlanMode()) {
          ctx.ui.notify("Not in plan mode.", "warning");
          return;
        }
        state.setPlanMode(true, "executing");
        refreshWidgets(ctx);
        ctx.ui.notify("Executing plan. All tools are available.", "info");
        return;
      }

      if (sub === "reset") {
        state.clear();
        state.setPlanMode(false, "idle");
        refreshWidgets(ctx);
        ctx.ui.notify("Plan reset. All tasks cleared.", "info");
        return;
      }

      const validMutations = ["done", "start", "delete"] as const;
      if (!validMutations.includes(sub as (typeof validMutations)[number])) {
        ctx.ui.notify(
          `Unknown subcommand: ${sub}\nUsage: /todos [list|done|start|delete|clear|add]`,
          "warning",
        );
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
          refreshWidgets(ctx);
          ctx.ui.notify(`Completed task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(
            err instanceof Error ? err.message : String(err),
            "error",
          );
        }
        return;
      }

      if (sub === "start") {
        try {
          const task = state.update(id, { status: "in_progress" });
          refreshWidgets(ctx);
          ctx.ui.notify(`Started task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(
            err instanceof Error ? err.message : String(err),
            "error",
          );
        }
        return;
      }

      if (sub === "delete") {
        try {
          const task = state.delete(id);
          refreshWidgets(ctx);
          ctx.ui.notify(`Deleted task #${task.id}: ${task.subject}`, "info");
        } catch (err) {
          ctx.ui.notify(
            err instanceof Error ? err.message : String(err),
            "error",
          );
        }
        return;
      }
    },
  });

  pi.registerCommand("goal", {
    description:
      "Set or manage a long-term objective: /goal <objective> | /goal edit <objective> | /goal pause | /goal resume | /goal clear",
    handler: async (args, ctx) => {
      const result = parseGoalCommand(args ?? "");
      if (typeof result === "string") {
        ctx.ui.notify(result, "warning");
        return;
      }

      switch (result.kind) {
        case "show": {
          const goal = goalState.get();
          if (!goal) {
            ctx.ui.notify("No active goal.", "info");
            return;
          }
          ctx.ui.notify(goalSummary(goal), "info");
          return;
        }
        case "start": {
          const existing = goalState.get();
          if (existing && ctx.hasUI) {
            const choice = await ctx.ui.select("Replace active goal?", [
              `Replace: ${existing.text}`,
              "Cancel",
            ]);
            if (choice !== `Replace: ${existing.text}`) {
              ctx.ui.notify("Goal unchanged.", "info");
              return;
            }
          }
          const goal = goalState.set(result.objective);
          persistGoal(goal);
          updateStatus(ctx, goal);
          refreshWidgets(ctx);
          ctx.ui.notify(`Goal set: ${goal.text}`, "info");
          sendGoalPrompt(pi, ctx, goal);
          return;
        }
        case "edit": {
          const current = goalState.get();
          if (!current || current.status === "complete") {
            ctx.ui.notify("No active goal. Use /goal <objective> to start one.", "warning");
            return;
          }
          const goal = goalState.edit(result.objective);
          persistGoal(goal);
          updateStatus(ctx, goal);
          refreshWidgets(ctx);
          ctx.ui.notify(`Goal updated: ${goal.text}`, "info");
          sendObjectiveUpdatedPrompt(pi, ctx, goal);
          return;
        }
        case "pause": {
          if (!goalState.get()) {
            ctx.ui.notify("No active goal to pause.", "warning");
            return;
          }
          goalState.pause();
          cancelContinuationPending();
          persistGoal(goalState.get());
          updateStatus(ctx, goalState.get());
          refreshWidgets(ctx);
          ctx.ui.notify("Goal paused.", "info");
          return;
        }
        case "resume": {
          const current = goalState.get();
          if (!current || current.status === "complete") {
            ctx.ui.notify("No active goal to resume.", "warning");
            return;
          }
          goalState.resume();
          persistGoal(goalState.get());
          updateStatus(ctx, goalState.get());
          refreshWidgets(ctx);
          ctx.ui.notify("Goal resumed.", "info");
          sendResumePrompt(pi, ctx, goalState.get()!);
          return;
        }
        case "clear": {
          if (!goalState.get()) {
            ctx.ui.notify("No goal to clear.", "info");
            return;
          }
          clearActiveGoal(ctx);
          ctx.ui.notify("Goal cleared.", "info");
          return;
        }
      }
    },
  });

  pi.registerShortcut(Key.ctrlShift("p"), {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (state.getPlanMode()) {
        state.clear();
        state.setPlanMode(false, "idle");
        refreshWidgets(ctx);
        ctx.ui.notify("Plan mode disabled.", "info");
      } else {
        state.setPlanMode(true, "planning");
        refreshWidgets(ctx);
        ctx.ui.notify(
          "Plan mode enabled. Only planning tools are available.",
          "info",
        );
      }
    },
  });

  // Tools allowed during planning phase. Note: bash is included because it is
  // useful for exploration, but it is NOT read-only; destructive commands are
  // still possible, so the LLM must exercise judgment.
  const PLANNING_TOOLS = new Set([
    "read",
    "bash",
    "grep",
    "find",
    "ls",
    "ask_user_question",
    "web_search",
    "web_fetch",
    "todo",
  ]);

  pi.on("tool_call", async (event, _ctx) => {
    if (state.getPlanMode() && state.getPlanPhase() === "planning") {
      if (!PLANNING_TOOLS.has(event.toolName)) {
        return {
          block: true,
          reason: "Plan mode: only planning tools are allowed",
        };
      }
    }
    if (goalState.isActive() && event.toolName === "ask_user_question") {
      return {
        block: true,
        reason:
          "Goal mode active: do not ask the user for confirmation or clarification. Proceed autonomously or use goal mark_blocked with a clear reason.",
      };
    }
  });

  pi.on("input", (event) => {
    if (event.source !== "extension") return;
    if (consumeCancelledContinuationPrompt(event.text))
      return { action: "handled" };
  });

  pi.on("before_agent_start", (event) => {
    markContinuationDelivered(event.prompt);
    if (isCancelledContinuationPrompt(event.prompt)) return;

    if (state.getPlanMode()) {
      if (state.getPlanPhase() === "planning") {
        return {
          message: {
            customType: "hidden",
            content:
              "You are in plan mode. You can only use the following planning tools: read, bash (note: bash can execute commands, including destructive ones, so use it carefully), grep, find, ls, ask_user_question, web_search, web_fetch. Use the todo tool to create a task list for the plan. Do not modify any files. Do not use edit, write, or any other modifying tools. Ask the user questions with ask_user_question if you need clarification.",
            display: false,
          },
        };
      }

      if (state.getPlanPhase() === "executing") {
        const tasks = state.list();
        const taskList = tasks
          .map((t) => `#${t.id} [${t.status}] ${t.subject}`)
          .join("\n");
        return {
          message: {
            customType: "hidden",
            content: `You are now executing the plan. Work through each task in order using the todo tool to mark progress. Mark tasks in_progress before beginning work on them. Mark tasks completed only when fully done.\n\nCurrent tasks:\n${taskList || "(none)"}`,
            display: false,
          },
        };
      }
    }

    const goal = goalState.get();
    if (!goal || goal.status !== "active") return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildGoalSystemPrompt(goal)}`,
    };
  });

  function findFinalAssistantMessage(
    messages: AgentEndEvent["messages"],
  ): AssistantMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === "assistant") {
        return message as AssistantMessage;
      }
    }
    return undefined;
  }

  pi.on("agent_end", async (event, ctx) => {
    refreshWidgets(ctx);

    // Plan mode completion dialog
    if (state.getPlanMode() && state.getPlanPhase() === "planning") {
      if (!ctx.hasUI) return;

      const tasks = state.list();
      if (tasks.length === 0) return;

      const choice = await ctx.ui.select("Plan Complete", [
        "Execute plan",
        "Continue planning",
        "Discard plan",
      ]);

      if (choice === "Execute plan") {
        state.setPlanMode(true, "executing");
        refreshWidgets(ctx);
      } else if (choice === "Discard plan") {
        state.clear();
        state.setPlanMode(false, "idle");
        refreshWidgets(ctx);
      }
      return;
    }

    if (state.getPlanMode()) return;

    const goal = goalState.get();
    if (!goal || goal.status !== "active") return;
    const goalId = goal.id;
    const hadPendingContinuation = continuationDelivered?.goalId === goalId;

    goalState.recordIteration();
    goalState.updateUsage(0, Date.now() - goal.startedAt);

    const currentGoal = goalState.get();
    if (!currentGoal || currentGoal.id !== goalId) return;

    const finalAssistant = findFinalAssistantMessage(event.messages);
    if (
      finalAssistant?.stopReason === "aborted" ||
      finalAssistant?.stopReason === "error"
    ) {
      goalState.pause();
      if (finalAssistant.stopReason === "error" && finalAssistant.errorMessage) {
        goalState.markBlocked(finalAssistant.errorMessage);
      }
      persistGoal(goalState.get());
      updateStatus(ctx, goalState.get());
      ctx.ui.notify(
        `Goal paused after ${finalAssistant.stopReason}. Run /goal resume to continue.`,
        "warning",
      );
      return;
    }

    if (currentGoal.iteration > MAX_CONTINUATIONS) {
      goalState.pause();
      persistGoal(goalState.get());
      updateStatus(ctx, goalState.get());
      ctx.ui.notify(
        `Goal paused after ${MAX_CONTINUATIONS} automatic continuations. The objective may be too broad or the agent may be stuck.`,
        "warning",
      );
      return;
    }

    persistGoal(goalState.get());
    updateStatus(ctx, goalState.get());

    if (hadPendingContinuation) {
      if (ctx.hasPendingMessages()) return;
      if (continuationDelivered?.goalId === goalId)
        continuationDelivered = undefined;
    }

    if (goalState.get()?.id !== goalId || goalState.get()?.status !== "active")
      return;
    if (ctx.hasPendingMessages()) return;
    sendContinuationPrompt(pi, ctx, goalState.get()!);
  });
}
