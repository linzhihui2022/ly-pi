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

export function renderOverlay(tasks: Task[], theme?: ThemeLike): string[] {
  const visible = tasks.filter((t) => t.status !== "deleted");
  if (visible.length === 0) return [];

  const lines: string[] = [];

  const title = `Tasks (${visible.length})`;
  lines.push(theme ? theme.fg("accent", theme.bold(title)) : title);

  for (const task of visible) {
    const symbol = STATUS_SYMBOLS[task.status];
    const line = `${symbol} #${task.id} ${task.subject}`;
    if (theme) {
      const color = STATUS_COLORS[task.status as Exclude<Task["status"], "deleted">];
      lines.push(theme.fg(color, line));
    } else {
      lines.push(line);
    }
  }

  return lines;
}
