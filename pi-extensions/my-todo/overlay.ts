import type { Task } from "./types";

const STATUS_ICONS: Record<Task["status"], string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✓",
  deleted: "🗑",
};

export function renderOverlay(tasks: Task[]): string[] {
  const visible = tasks.filter((t) => t.status !== "deleted");
  if (visible.length === 0) return [];

  const lines: string[] = [`Tasks (${visible.length})`];
  for (const task of visible) {
    const icon = STATUS_ICONS[task.status];
    lines.push(`${icon} #${task.id} ${task.subject}`);
  }
  return lines;
}
