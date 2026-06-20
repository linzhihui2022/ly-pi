import type { ActiveGoal, GoalStatus } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: "accent",
  paused: "muted",
  complete: "muted",
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export function renderGoalOverlay(
  goal: ActiveGoal,
  theme?: ThemeLike,
): string[] {
  const lines: string[] = [];
  const title = `Goal [${goal.status}]`;
  lines.push(
    theme ? theme.fg(STATUS_COLORS[goal.status], theme.bold(title)) : title,
  );
  lines.push(
    theme ? theme.fg("dim", truncate(goal.text)) : truncate(goal.text),
  );
  lines.push(
    theme
      ? theme.fg("dim", `Iterations: ${goal.iteration}`)
      : `Iterations: ${goal.iteration}`,
  );
  if (goal.blocker) {
    const block = `Paused: ${truncate(goal.blocker)}`;
    lines.push(theme ? theme.fg("error", block) : block);
  }
  return lines;
}
