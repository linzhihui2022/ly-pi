import type { Goal, GoalStatus } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  idle: "dim",
  active: "accent",
  paused: "muted",
  completed: "muted",
  blocked: "error",
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function renderGoalOverlay(goal: Goal, theme?: ThemeLike): string[] {
  const lines: string[] = [];
  const title = `Goal [${goal.status}]`;
  const titleText = theme ? theme.fg(STATUS_COLORS[goal.status], theme.bold(title)) : title;
  lines.push(titleText);
  lines.push(theme ? theme.fg("dim", truncate(goal.objective)) : truncate(goal.objective));

  if (goal.iterationCount > 0) {
    const it = `Iterations: ${goal.iterationCount}`;
    lines.push(theme ? theme.fg("dim", it) : it);
  }

  if (goal.lastEvidence.trim()) {
    const ev = `Evidence: ${truncate(goal.lastEvidence)}`;
    lines.push(theme ? theme.fg("dim", ev) : ev);
  }

  if (goal.blocker) {
    const block = `Blocker: ${truncate(goal.blocker)}`;
    lines.push(theme ? theme.fg("error", block) : block);
  }

  return lines;
}
