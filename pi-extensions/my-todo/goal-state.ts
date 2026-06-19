import type { Goal, GoalEntry, GoalStatus, SessionEntry } from "./types";

const VALID_GOAL_STATUSES: GoalStatus[] = ["idle", "active", "paused", "completed", "blocked"];
const VALID_EVALUATE_STATUSES: GoalStatus[] = ["active", "paused", "blocked"];

function isValidGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (VALID_GOAL_STATUSES as string[]).includes(value);
}

function isValidGoal(value: unknown): value is Goal {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.objective !== "string") return false;
  if (!isValidGoalStatus(obj.status)) return false;
  if (typeof obj.iterationCount !== "number") return false;
  if (typeof obj.lastEvidence !== "string") return false;
  if (typeof obj.nextAction !== "string") return false;
  if (obj.blocker !== undefined && typeof obj.blocker !== "string") return false;
  return true;
}

function deepCopyGoal(goal: Goal): Goal {
  return {
    objective: goal.objective,
    status: goal.status,
    iterationCount: goal.iterationCount,
    lastEvidence: goal.lastEvidence,
    nextAction: goal.nextAction,
    blocker: goal.blocker,
    entries: goal.entries ? [...goal.entries] : undefined,
  };
}

export class GoalState {
  private goal: Goal | null = null;
  private hadUsefulWork = false;
  private entries: GoalEntry[] = [];

  get(): Goal | null {
    if (!this.goal) return null;
    const copy = deepCopyGoal(this.goal);
    copy.entries = this.getEntries();
    return copy;
  }

  getStatus(): GoalStatus {
    return this.goal?.status ?? "idle";
  }

  isActive(): boolean {
    return this.goal?.status === "active";
  }

  canAutoContinue(): boolean {
    return this.isActive() && this.hadUsefulWork;
  }

  set(objective: string): Goal {
    const trimmed = objective.trim();
    if (trimmed === "") {
      throw new Error("Objective is required");
    }
    this.entries = [];
    this.goal = {
      objective: trimmed,
      status: "active",
      iterationCount: 0,
      lastEvidence: "",
      nextAction: "",
    };
    this.hadUsefulWork = true;
    return deepCopyGoal(this.goal);
  }

  pause(): void {
    if (!this.goal) return;
    this.goal.status = "paused";
  }

  resume(): void {
    if (!this.goal) return;
    if (this.goal.status === "completed" || this.goal.status === "blocked") {
      throw new Error("Cannot resume a completed or blocked goal");
    }
    this.goal.status = "active";
  }

  clear(): void {
    this.goal = null;
    this.hadUsefulWork = false;
    this.entries = [];
  }

  evaluate(lastEvidence?: string, nextAction?: string, status?: GoalStatus): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (lastEvidence !== undefined) this.goal.lastEvidence = lastEvidence;
    if (nextAction !== undefined) this.goal.nextAction = nextAction;
    if (status !== undefined) {
      if (!VALID_EVALUATE_STATUSES.includes(status)) {
        throw new Error(`Invalid evaluate status: ${status}`);
      }
      this.goal.status = status;
    }
    this.recordEntry();
    return deepCopyGoal(this.goal);
  }

  markComplete(evidence: string): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (evidence.trim() === "") throw new Error("Evidence is required");
    this.goal.status = "completed";
    this.goal.lastEvidence = evidence;
    this.goal.nextAction = "";
    this.recordEntry();
    return deepCopyGoal(this.goal);
  }

  markBlocked(reason: string, nextInputNeeded?: boolean): Goal {
    if (!this.goal) throw new Error("No active goal");
    if (reason.trim() === "") throw new Error("Reason is required");
    this.goal.status = "blocked";
    this.goal.blocker = reason;
    this.goal.nextAction = nextInputNeeded ? "Waiting for user input" : "";
    this.recordEntry();
    return deepCopyGoal(this.goal);
  }

  private recordEntry(): void {
    const g = this.goal!;
    this.entries.push({
      iteration: g.iterationCount,
      evidence: g.lastEvidence,
      nextAction: g.nextAction,
      status: g.status,
    });
  }

  getEntries(): GoalEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  recordIteration(): void {
    if (!this.goal) return;
    this.goal.iterationCount += 1;
  }

  setHadUsefulWork(value: boolean): void {
    this.hadUsefulWork = value;
  }

  snapshot(): Goal | null {
    if (!this.goal) return null;
    const copy = deepCopyGoal(this.goal);
    copy.entries = this.getEntries();
    return copy;
  }

  static fromSession(entries: SessionEntry[]): GoalState {
    const state = new GoalState();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "message") continue;
      if (entry.message?.role !== "toolResult") continue;
      if (entry.message.toolName !== "goal") continue;
      if (typeof entry.message.details !== "object" || entry.message.details === null) continue;
      const details = entry.message.details as Record<string, unknown>;
      if (!isValidGoal(details.goal)) continue;
      state.goal = deepCopyGoal(details.goal as Goal);
      if (state.goal.entries) state.entries = [...state.goal.entries];
      break;
    }
    return state;
  }
}
