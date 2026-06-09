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

const MAX_VISIBLE = 5;

function sortByPriority(tasks: Task[]): Task[] {
  const priority: Record<Task["status"], number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
    deleted: 3,
  };
  return [...tasks].sort((a, b) => priority[a.status] - priority[b.status]);
}

export function renderOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status !== "deleted");
  if (visible.length === 0) return [];

  const sorted = sortByPriority(visible);
  const display = sorted.slice(0, MAX_VISIBLE);
  const overflow = sorted.length - MAX_VISIBLE;

  const lines: string[] = [];

  const title = `Tasks (${visible.length})`;
  lines.push(theme ? theme.fg("accent", theme.bold(title)) : title);

  for (const task of display) {
    const symbol = STATUS_SYMBOLS[task.status];
    const line = `${symbol} #${task.id} ${task.subject}`;
    if (theme) {
      const color = STATUS_COLORS[task.status as Exclude<Task["status"], "deleted">];
      lines.push(theme.fg(color, line));
    } else {
      lines.push(line);
    }
  }

  if (overflow > 0) {
    const more = `  +${overflow} more`;
    lines.push(theme ? theme.fg("dim", more) : more);
  }

  return lines;
}
