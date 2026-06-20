import type { ActiveGoal, GoalEntry, GoalStatus, SessionEntry } from "./types";

const MAX_OBJECTIVE_LENGTH = 4000;
const VALID_GOAL_STATUSES: GoalStatus[] = ["active", "paused", "complete"];
const VALID_EVALUATE_STATUSES: GoalStatus[] = ["active", "paused"];

function isValidGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (VALID_GOAL_STATUSES as string[]).includes(value);
}

function isValidActiveGoal(value: unknown): value is ActiveGoal {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (typeof obj.text !== "string") return false;
  if (!isValidGoalStatus(obj.status)) return false;
  if (typeof obj.startedAt !== "number") return false;
  if (typeof obj.updatedAt !== "number") return false;
  if (typeof obj.iteration !== "number") return false;
  if (typeof obj.tokensUsed !== "number") return false;
  if (typeof obj.timeUsedSeconds !== "number") return false;
  if (obj.blocker !== undefined && typeof obj.blocker !== "string") return false;
  if (obj.lastEvidence !== undefined && typeof obj.lastEvidence !== "string") return false;
  if (obj.nextAction !== undefined && typeof obj.nextAction !== "string") return false;
  return true;
}

function deepCopyGoal(goal: ActiveGoal): ActiveGoal {
  return { ...goal };
}

export class GoalState {
  private goal: ActiveGoal | null = null;
  private entries: GoalEntry[] = [];

  get(): ActiveGoal | null {
    if (!this.goal) return null;
    return deepCopyGoal(this.goal);
  }

  getStatus(): GoalStatus | "idle" {
    return this.goal?.status ?? "idle";
  }

  isActive(): boolean {
    return this.goal?.status === "active";
  }

  canAutoContinue(): boolean {
    return this.isActive();
  }

  set(text: string): ActiveGoal {
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("Objective is required");
    if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
      throw new Error(`Goal objective is too long (${trimmed.length}/${MAX_OBJECTIVE_LENGTH} characters)`);
    }
    this.entries = [];
    const now = Date.now();
    this.goal = {
      id: crypto.randomUUID(),
      text: trimmed,
      status: "active",
      startedAt: now,
      updatedAt: now,
      iteration: 0,
      tokensUsed: 0,
      timeUsedSeconds: 0,
    };
    return deepCopyGoal(this.goal);
  }

  edit(text: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (this.goal.status === "complete") throw new Error("Cannot edit a completed goal");
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("Objective is required");
    if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
      throw new Error(`Goal objective is too long (${trimmed.length}/${MAX_OBJECTIVE_LENGTH} characters)`);
    }
    this.goal.text = trimmed;
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  pause(): void {
    if (!this.goal) return;
    if (this.goal.status !== "active") return;
    this.goal.status = "paused";
    this.goal.updatedAt = Date.now();
  }

  resume(): void {
    if (!this.goal) return;
    if (this.goal.status === "complete") throw new Error("Cannot resume a completed goal");
    if (this.goal.status === "active") return;
    this.goal.status = "active";
    this.goal.blocker = undefined;
    this.goal.updatedAt = Date.now();
  }

  clear(): void {
    this.goal = null;
    this.entries = [];
  }

  evaluate(lastEvidence?: string, nextAction?: string, status?: GoalStatus): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (this.goal.status === "complete") throw new Error("Cannot evaluate a completed goal");
    const previousStatus = this.goal.status;
    if (lastEvidence !== undefined) {
      this.recordEntry(previousStatus, lastEvidence, this.goal.nextAction ?? "");
      this.goal.lastEvidence = lastEvidence;
    }
    if (nextAction !== undefined) this.goal.nextAction = nextAction;
    if (status !== undefined) {
      if (!VALID_EVALUATE_STATUSES.includes(status)) throw new Error(`Invalid evaluate status: ${status}`);
      this.goal.status = status;
      if (status === "paused" && !this.goal.blocker) {
        this.goal.blocker = previousStatus === "active" ? "Paused by evaluate" : undefined;
      }
      if (status === "active") {
        this.goal.blocker = undefined;
      }
    }
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  markBlocked(reason: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (this.goal.status === "complete") throw new Error("Cannot block a completed goal");
    if (reason.trim() === "") throw new Error("Reason is required");
    this.recordEntry(this.goal.status, this.goal.lastEvidence ?? "", this.goal.nextAction ?? "");
    this.goal.status = "paused";
    this.goal.blocker = reason;
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  markComplete(evidence: string): ActiveGoal {
    if (!this.goal) throw new Error("No active goal");
    if (evidence.trim() === "") throw new Error("Evidence is required");
    this.recordEntry("complete", evidence, "");
    this.goal.status = "complete";
    this.goal.updatedAt = Date.now();
    return deepCopyGoal(this.goal);
  }

  recordIteration(): void {
    if (!this.goal) return;
    this.goal.iteration += 1;
    this.goal.updatedAt = Date.now();
  }

  updateUsage(tokensUsed: number, timeUsedMs: number): void {
    if (!this.goal) return;
    this.goal.tokensUsed = tokensUsed;
    this.goal.timeUsedSeconds = Math.floor(timeUsedMs / 1000);
    this.goal.updatedAt = Date.now();
  }

  getEntries(): GoalEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  private recordEntry(status: GoalStatus, evidence: string, nextAction: string): void {
    const g = this.goal!;
    this.entries.push({ iteration: g.iteration, evidence, nextAction, status });
  }

  static fromSession(entries: SessionEntry[]): GoalState {
    const state = new GoalState();
    const goalEntry = entries
      .filter((e): e is SessionEntry & { type: "custom"; customType: "goal-state"; data: { goal?: unknown } } =>
        e.type === "custom" && e.customType === "goal-state" && typeof e.data === "object" && e.data !== null
      )
      .pop();
    const goal = goalEntry?.data?.goal;
    if (isValidActiveGoal(goal) && goal.status !== "complete") {
      state.goal = deepCopyGoal(goal);
    }
    return state;
  }
}
