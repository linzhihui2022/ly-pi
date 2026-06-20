import type { ActiveGoal, GoalStatus } from "./types";

export const MAX_CONTINUATIONS = 50;
export const CONTINUATION_MARKER_PREFIX = "pi-goal-continuation:";

export function buildGoalSystemPrompt(goal: ActiveGoal): string {
  return `Active /goal:\n${goalObjectiveBlock(goal)}\n\nGoal-mode rules:\n- Keep going until the active goal is completely resolved end-to-end.\n- Treat the current worktree, command output, tests, and external state as authoritative.\n- Do not redefine the goal into a smaller task; audit every requirement before completion.\n- Do not stop at analysis, a plan, TODO list, partial fixes, or suggested next steps.\n- Autonomously perform implementation and verification with the available tools when they are needed to complete the goal.\n- Persevere through recoverable tool failures by trying reasonable alternatives instead of yielding early.\n- If the goal is not complete at the end of a turn, expect an automatic continuation and keep working from where you left off.\n- Only call the goal_complete tool after the goal is fully complete and verified.`;
}

export function buildGoalPrompt(goal: ActiveGoal): string {
  return `Goal mode is active. Complete this goal fully:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("this goal")}`;
}

export function buildObjectiveUpdatedPrompt(goal: ActiveGoal): string {
  return `The active /goal objective was updated. Continue working toward this goal:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("the updated goal")}`;
}

export function buildResumePrompt(goal: ActiveGoal): string {
  return `The user explicitly resumed the paused /goal. Continue working toward this goal:\n\n${goalObjectiveBlock(goal)}\n\n${goalPersistenceRules("this goal")}`;
}

export function buildContinuePrompt(goal: ActiveGoal, marker: string): string {
  return `Continue the active /goal until it is complete:\n\n${goalObjectiveBlock(goal)}\n\nThis is automatic continuation #${goal.iteration}. Current files, command output, tests, and external state are authoritative; re-check them as needed. ${goalPersistenceRules("this goal")}\n\n${continuationMarkerComment(marker)}`;
}

export function continuationMarker(goal: ActiveGoal): string {
  return `${goal.id}:${goal.iteration}`;
}

export function extractContinuationMarker(prompt: string): string | undefined {
  const pattern = new RegExp(`<!-- ${escapeRegExp(CONTINUATION_MARKER_PREFIX)}([^>]+) -->`);
  return pattern.exec(prompt)?.[1];
}

export function formatStatus(goal: ActiveGoal | undefined): string | undefined {
  if (!goal) return undefined;
  if (goal.status === "complete") return "complete";
  if (goal.status === "paused") return "paused";
  return `active ${formatDuration(goal.timeUsedSeconds)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

export function formatTokenCount(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 1000000) return `${Number.isInteger(value / 1000) ? value / 1000 : (value / 1000).toFixed(1)}k`;
  return `${Number.isInteger(value / 1000000) ? value / 1000000 : (value / 1000000).toFixed(1)}m`;
}

export function formatBudget(goal: ActiveGoal): string {
  return `${formatTokenCount(goal.tokensUsed)}/${formatTokenCount(0)}`;
}

export function goalSummary(goal: ActiveGoal): string {
  return [
    `Goal: ${goal.text}`,
    `Status: ${goal.status}`,
    `Iteration: ${goal.iteration}`,
    `Elapsed: ${formatDuration(goal.timeUsedSeconds)}`,
    `Commands: ${goalCommandHint(goal.status)}`,
  ].join("\n");
}

export function goalCommandHint(status: GoalStatus): string {
  if (status === "active") return "/goal edit <objective>, /goal pause, /goal clear";
  if (status === "paused") return "/goal edit <objective>, /goal resume, /goal clear";
  return "/goal edit <objective>, /goal clear";
}

function goalObjectiveBlock(goal: ActiveGoal): string {
  return `\n${goal.text}\n`;
}

function goalPersistenceRules(goalLabel: string): string {
  return `Keep going until ${goalLabel} is completely resolved end-to-end. Do not redefine ${goalLabel} into a smaller task. Do not stop at analysis, a plan, TODO list, partial fixes, or suggested next steps. Autonomously perform implementation and verification with the available tools when they are needed. Treat the current worktree, command output, tests, and external state as authoritative. If a tool call fails, try reasonable alternatives instead of yielding early. Before calling goal_complete, audit ${goalLabel} requirement by requirement against the verified current state. Only call the goal_complete tool after ${goalLabel} is fully complete and verified.`;
}

function continuationMarkerComment(marker: string): string {
  return `<!-- ${CONTINUATION_MARKER_PREFIX}${marker} -->`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
