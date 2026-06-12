import type { Task } from "./types";

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const STATUS_SYMBOLS: Record<Task["status"], string> = {
  pending: "○",
  in_progress: "●",
  completed: "✓",
  deleted: "🗑",
};

const STATUS_COLORS: Record<Exclude<Task["status"], "deleted">, string> = {
  pending: "dim",
  in_progress: "accent",
  completed: "muted",
};

const MAX_VISIBLE = 3;

function sortByPriority(tasks: Task[]): Task[] {
  const priority: Record<Task["status"], number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
    deleted: 3,
  };
  return [...tasks].sort((a, b) => priority[a.status] - priority[b.status]);
}

function renderTaskList(
  tasks: Task[],
  title: string,
  titleColor: string,
  lineColor: string | ((task: Task) => string) | undefined,
  theme?: ThemeLike
): string[] {
  const display = tasks.slice(0, MAX_VISIBLE);
  const overflow = tasks.length - MAX_VISIBLE;

  const lines: string[] = [];
  lines.push(theme ? theme.fg(titleColor, theme.bold(title)) : title);

  for (const task of display) {
    if (theme) {
      const color = typeof lineColor === "function" ? lineColor(task) : lineColor;
      lines.push(theme.fg(color, `${STATUS_SYMBOLS[task.status]} #${task.id} ${task.subject}`));
    } else {
      lines.push(`${STATUS_SYMBOLS[task.status]} #${task.id} ${task.subject}`);
    }
  }

  if (overflow > 0) {
    const more = `  +${overflow} more`;
    lines.push(theme ? theme.fg("dim", more) : more);
  }

  return lines;
}

export function renderActiveOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (visible.length === 0) return [];

  const sorted = sortByPriority(visible);
  const title = `Active (${sorted.length})`;
  return renderTaskList(
    sorted,
    title,
    "accent",
    (task) => STATUS_COLORS[task.status as "pending" | "in_progress"],
    theme
  );
}

export function renderCompletedOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status === "completed");
  if (visible.length === 0) return [];

  const sorted = [...visible].sort((a, b) => b.id - a.id);
  const title = `Completed (${sorted.length})`;
  return renderTaskList(sorted, title, "muted", "muted", theme);
}

// Backward-compatible alias until index.ts is updated:
export function renderOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  return renderActiveOverlay(tasks, theme);
}
