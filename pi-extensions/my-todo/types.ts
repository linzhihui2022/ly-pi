export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export interface Task {
  id: number;
  subject: string;
  description?: string;
  status: TaskStatus;
}

export type TaskAction = "create" | "update" | "list" | "get" | "delete" | "clear";

export type PlanPhase = "idle" | "planning" | "executing";

export interface SessionEntry {
  type: string;
  message?: {
    role: string;
    toolName?: string;
    details?: Record<string, unknown>;
  };
}
