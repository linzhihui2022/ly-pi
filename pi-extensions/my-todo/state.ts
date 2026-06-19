import type { Task, TaskStatus, SessionEntry, PlanPhase } from "./types";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "completed", "deleted"],
  in_progress: ["pending", "completed", "deleted"],
  completed: ["deleted"],
  deleted: [],
};

const VALID_PLAN_PHASES: PlanPhase[] = ["idle", "planning", "executing"];

function deepCopyTask(task: Task): Task {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: task.status,
  };
}

function deepCopyTasks(tasks: Task[]): Task[] {
  return tasks.map(deepCopyTask);
}

function isValidPlanPhase(value: unknown): value is PlanPhase {
  return (
    typeof value === "string" && (VALID_PLAN_PHASES as string[]).includes(value)
  );
}

function isValidDetails(value: unknown): value is {
  tasks: Task[];
  nextId: number;
  planMode?: boolean;
  planPhase?: PlanPhase;
} {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) return false;
  if (typeof obj.nextId !== "number") return false;
  // planMode/planPhase are optional for backward compat
  if (obj.planMode !== undefined && typeof obj.planMode !== "boolean")
    return false;
  if (obj.planPhase !== undefined && !isValidPlanPhase(obj.planPhase))
    return false;
  return obj.tasks.every(
    (t) =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as Record<string, unknown>).id === "number" &&
      typeof (t as Record<string, unknown>).subject === "string" &&
      typeof (t as Record<string, unknown>).status === "string",
  );
}

export class TaskState {
  private tasks: Task[] = [];
  private nextId = 1;
  private planMode = false;
  private planPhase: PlanPhase = "idle";

  create(subject: string, description?: string): Task {
    const trimmed = subject.trim();
    if (trimmed === "") {
      throw new Error("Subject is required");
    }
    const task: Task = {
      id: this.nextId,
      subject: trimmed,
      description,
      status: "pending",
    };
    this.tasks.push(task);
    this.nextId += 1;
    return deepCopyTask(task);
  }

  get(id: number): Task | undefined {
    const task = this.tasks.find((t) => t.id === id);
    return task ? deepCopyTask(task) : undefined;
  }

  update(
    id: number,
    updates: Partial<Pick<Task, "subject" | "description" | "status">>,
  ): Task {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (updates.subject !== undefined) {
      const trimmed = updates.subject.trim();
      if (trimmed === "") {
        throw new Error("Subject cannot be empty");
      }
      task.subject = trimmed;
    }

    if ("description" in updates) {
      task.description = updates.description;
    }

    if (updates.status !== undefined) {
      if (!VALID_TRANSITIONS[task.status].includes(updates.status)) {
        throw new Error("Invalid status transition");
      }
      task.status = updates.status;
    }

    return deepCopyTask(task);
  }

  delete(id: number): Task {
    return this.update(id, { status: "deleted" });
  }

  list(includeDeleted = false): Task[] {
    const filtered = includeDeleted
      ? this.tasks
      : this.tasks.filter((t) => t.status !== "deleted");
    return deepCopyTasks(filtered);
  }

  clear(): void {
    this.tasks = [];
    this.nextId = 1;
  }

  getTasks(): Task[] {
    return deepCopyTasks(this.tasks);
  }

  getNextId(): number {
    return this.nextId;
  }

  getPlanMode(): boolean {
    return this.planMode;
  }

  getPlanPhase(): PlanPhase {
    return this.planPhase;
  }

  setPlanMode(mode: boolean, phase: PlanPhase): void {
    if (!isValidPlanPhase(phase)) {
      throw new Error(`Invalid plan phase: ${phase}`);
    }
    this.planMode = mode;
    this.planPhase = phase;
  }

  snapshot(): {
    tasks: Task[];
    nextId: number;
    planMode: boolean;
    planPhase: PlanPhase;
  } {
    return {
      tasks: deepCopyTasks(this.tasks),
      nextId: this.nextId,
      planMode: this.planMode,
      planPhase: this.planPhase,
    };
  }

  static fromSession(entries: SessionEntry[]): TaskState {
    const state = new TaskState();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "message") continue;
      if (entry.message?.role !== "toolResult") continue;
      if (entry.message.toolName !== "todo") continue;
      if (!isValidDetails(entry.message.details)) continue;

      state.tasks = deepCopyTasks(entry.message.details.tasks);
      state.nextId = entry.message.details.nextId;
      if (typeof entry.message.details.planMode === "boolean") {
        state.planMode = entry.message.details.planMode;
      }
      if (isValidPlanPhase(entry.message.details.planPhase)) {
        state.planPhase = entry.message.details.planPhase;
      }
      break;
    }
    return state;
  }
}
