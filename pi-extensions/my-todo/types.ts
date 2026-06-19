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
    details?: unknown;
  };
}

export type GoalStatus = "idle" | "active" | "paused" | "completed" | "blocked";

export interface GoalEntry {
  iteration: number;
  evidence: string;
  nextAction: string;
  status: GoalStatus;
}

export interface Goal {
  objective: string;
  status: GoalStatus;
  iterationCount: number;
  lastEvidence: string;
  nextAction: string;
  blocker?: string;
  entries?: GoalEntry[];
}

export interface GoalDetails {
  goal: Goal;
}
