import { Type } from "typebox";
import {
  defineTool,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { GoalState } from "./goal-state";
import type { ActiveGoal } from "./types";

export interface GoalCompleteDeps {
  persistGoal(goal: ActiveGoal | null): void;
  clearStatus(ctx: ExtensionContext): void;
  notify(
    ctx: ExtensionContext,
    message: string,
    level?: "info" | "warning" | "error",
  ): void;
}

export function createGoalCompleteTool(
  state: GoalState,
  deps: GoalCompleteDeps,
): ToolDefinition {
  return defineTool({
    name: "goal_complete",
    label: "Goal Complete",
    description:
      "Mark the active /goal as complete. Only call this after the requested goal is fully done and verified.",
    promptSnippet:
      "Mark the active /goal as complete after fully finishing and verifying it",
    promptGuidelines: [
      "When a /goal is active, keep working until the goal is complete; do not stop with only a plan or partial progress.",
      "Before calling goal_complete, audit the active goal requirement by requirement against the current files, command output, tests, or external state.",
      "Call goal_complete only after the requested goal is fully implemented, verified, and no known required work remains.",
    ],
    parameters: Type.Object({
      summary: Type.String({
        description:
          "Concise summary of what was completed and how it was verified.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const completedGoal = state.get();
      if (!completedGoal || completedGoal.status !== "active") {
        return {
          content: [{ type: "text", text: "Error: no active goal to complete" }],
          details: {},
          isError: true,
        };
      }
      const summary = params.summary.trim();
      if (!summary) {
        return {
          content: [{ type: "text", text: "Error: summary is required" }],
          details: {},
          isError: true,
        };
      }
      const goalText = completedGoal.text;
      state.markComplete(summary);
      deps.persistGoal(null);
      deps.clearStatus(ctx);
      deps.notify(ctx, `Goal complete: ${goalText}`, "info");
      return {
        content: [{ type: "text", text: `Goal complete: ${summary}` }],
        details: { goal: goalText, summary },
        terminate: true,
      };
    },
  });
}
