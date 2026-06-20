export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export interface Task {
  id: number;
  subject: string;
  description?: string;
  status: TaskStatus;
}

export type TaskAction =
  | "create"
  | "update"
  | "list"
  | "get"
  | "delete"
  | "clear";

export type PlanPhase = "idle" | "planning" | "executing";

export interface SessionEntry {
  type: string;
  customType?: string;
  data?: unknown;
  message?: {
    role: string;
    toolName?: string;
    details?: unknown;
  };
}

export type GoalStatus = "active" | "paused" | "complete";

export interface ActiveGoal {
  id: string;
  text: string;
  status: GoalStatus;
  startedAt: number;
  updatedAt: number;
  iteration: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  blocker?: string;
  lastEvidence?: string;
  nextAction?: string;
}

export interface GoalEntry {
  iteration: number;
  evidence: string;
  nextAction: string;
  status: GoalStatus;
}

export interface GoalStateEntryData {
  goal?: ActiveGoal | null;
}
