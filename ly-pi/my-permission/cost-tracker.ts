import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { basename } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

export const COST_TYPES = [
  "judge",
  "advocate-analysis",
  "advocate-merge",
  "prosecutor-analysis",
  "prosecutor-merge",
] as const;

export type CostType = (typeof COST_TYPES)[number];

export interface CostStats {
  totalCost: number;
  calls: number;
  byModel: Record<string, { totalCost: number; calls: number }>;
}

export interface CostBucket extends CostStats {
  daily: Record<string, CostStats>;
}

export interface SessionSummary {
  sessionId: string;
  judge: { totalCost: number; calls: number };
  advocate: {
    analysis: { totalCost: number; calls: number };
    merge: { totalCost: number; calls: number };
  };
  prosecutor: {
    analysis: { totalCost: number; calls: number };
    merge: { totalCost: number; calls: number };
  };
  totalCost: number;
  totalCalls: number;
  firstTs: string;
  lastTs: string;
}

export interface DailySummary {
  judge: { totalCost: number; calls: number };
  advocate: {
    analysis: { totalCost: number; calls: number };
    merge: { totalCost: number; calls: number };
  };
  prosecutor: {
    analysis: { totalCost: number; calls: number };
    merge: { totalCost: number; calls: number };
  };
  totalCost: number;
  totalCalls: number;
}

export interface ModelSummary {
  model: string;
  totalCost: number;
  calls: number;
}

export interface CostAggregation {
  judge: CostBucket;
  advocate: {
    analysis: CostBucket;
    merge: CostBucket;
  };
  prosecutor: {
    analysis: CostBucket;
    merge: CostBucket;
  };
  /** All model entries across all roles, sorted by cost descending. */
  models: ModelSummary[];
  /** Per-session summaries, sorted by firstTs ascending. */
  sessions: SessionSummary[];
  /** Cross-role daily summaries, sorted by date ascending. */
  daily: Record<string, DailySummary>;
}

/** Encode cwd to session directory name. */
export function encodeProjectDir(cwd: string): string {
  const trimmed = cwd.replace(/^\//, "").replace(/\/$/, "");
  return `--${trimmed.replace(/\//g, "-")}--`;
}

export function getCostsDir(): string {
  return join(homedir(), ".pi", "costs");
}

export function getCostsFilePath(
  sessionId: string,
  cwd: string,
  costsDir?: string,
): string {
  return join(
    costsDir ?? getCostsDir(),
    encodeProjectDir(cwd),
    `${sessionId}.jsonl`,
  );
}

export interface AppendCostOptions {
  costsDir?: string;
}

export function appendCost(
  sessionId: string,
  cwd: string,
  type: CostType,
  cost: number,
  model: string,
  opts?: AppendCostOptions,
): void {
  const baseDir = opts?.costsDir ?? getCostsDir();
  const filePath = getCostsFilePath(sessionId, cwd, baseDir);
  const dir = join(baseDir, encodeProjectDir(cwd));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const entry = JSON.stringify({
    type,
    cost,
    model,
    ts: new Date().toISOString(),
  });
  appendFileSync(filePath, `${entry}\n`, "utf-8");
}

// ---- aggregation helpers ----

function emptyBucket(): CostBucket {
  return { totalCost: 0, calls: 0, byModel: {}, daily: {} };
}

function emptyStats(): CostStats {
  return { totalCost: 0, calls: 0, byModel: {} };
}

function addToStats(stats: CostStats, cost: number, model: string): void {
  stats.totalCost += cost;
  stats.calls += 1;
  if (!stats.byModel[model]) {
    stats.byModel[model] = { totalCost: 0, calls: 0 };
  }
  stats.byModel[model].totalCost += cost;
  stats.byModel[model].calls += 1;
}

function addToBucket(
  bucket: CostBucket,
  cost: number,
  model: string,
  date: string,
): void {
  addToStats(bucket, cost, model);
  if (!bucket.daily[date]) {
    bucket.daily[date] = emptyStats();
  }
  addToStats(bucket.daily[date], cost, model);
}

function addToSlot(
  slot: { totalCost: number; calls: number },
  cost: number,
): void {
  slot.totalCost += cost;
  slot.calls += 1;
}

function emptySession(sessionId: string): SessionSummary {
  return {
    sessionId,
    judge: { totalCost: 0, calls: 0 },
    advocate: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    prosecutor: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    totalCost: 0,
    totalCalls: 0,
    firstTs: "",
    lastTs: "",
  };
}

function emptyDaily(): DailySummary {
  return {
    judge: { totalCost: 0, calls: 0 },
    advocate: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    prosecutor: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    totalCost: 0,
    totalCalls: 0,
  };
}

// ---- parse helpers ----

function isCostType(value: unknown): value is CostType {
  return (
    typeof value === "string" &&
    (COST_TYPES as readonly string[]).includes(value)
  );
}

interface RawEntry {
  type: CostType;
  cost: number;
  model: string;
  ts: string;
}

function isValidEntry(entry: unknown): entry is RawEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return (
    isCostType(e.type) &&
    typeof e.cost === "number" &&
    !Number.isNaN(e.cost) &&
    typeof e.model === "string" &&
    typeof e.ts === "string"
  );
}

function parseLine(line: string): RawEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!isValidEntry(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- aggregation ----

export interface AggregateOptions {
  costsDir?: string;
}

export function aggregateCosts(
  cwd?: string,
  opts?: AggregateOptions,
): CostAggregation {
  const result: CostAggregation = {
    judge: emptyBucket(),
    advocate: {
      analysis: emptyBucket(),
      merge: emptyBucket(),
    },
    prosecutor: {
      analysis: emptyBucket(),
      merge: emptyBucket(),
    },
    models: [],
    sessions: [],
    daily: {},
  };

  const costsDir = opts?.costsDir ?? getCostsDir();
  const modelMap = new Map<string, { totalCost: number; calls: number }>();
  const sessionMap = new Map<string, SessionSummary>();

  function processFile(filePath: string, sessionId: string): void {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const entry = parseLine(line);
      if (!entry) continue;

      const date = entry.ts.slice(0, 10);

      // Bucket aggregation
      switch (entry.type) {
        case "judge":
          addToBucket(result.judge, entry.cost, entry.model, date);
          break;
        case "advocate-analysis":
          addToBucket(
            result.advocate.analysis,
            entry.cost,
            entry.model,
            date,
          );
          break;
        case "advocate-merge":
          addToBucket(result.advocate.merge, entry.cost, entry.model, date);
          break;
        case "prosecutor-analysis":
          addToBucket(
            result.prosecutor.analysis,
            entry.cost,
            entry.model,
            date,
          );
          break;
        case "prosecutor-merge":
          addToBucket(
            result.prosecutor.merge,
            entry.cost,
            entry.model,
            date,
          );
          break;
      }

      // Model aggregation
      let modelEntry = modelMap.get(entry.model);
      if (!modelEntry) {
        modelEntry = { totalCost: 0, calls: 0 };
        modelMap.set(entry.model, modelEntry);
      }
      modelEntry.totalCost += entry.cost;
      modelEntry.calls += 1;

      // Session aggregation
      let session = sessionMap.get(sessionId);
      if (!session) {
        session = emptySession(sessionId);
        sessionMap.set(sessionId, session);
      }
      session.totalCost += entry.cost;
      session.totalCalls += 1;
      if (!session.firstTs || entry.ts < session.firstTs)
        session.firstTs = entry.ts;
      if (!session.lastTs || entry.ts > session.lastTs)
        session.lastTs = entry.ts;

      switch (entry.type) {
        case "judge":
          addToSlot(session.judge, entry.cost);
          break;
        case "advocate-analysis":
          addToSlot(session.advocate.analysis, entry.cost);
          break;
        case "advocate-merge":
          addToSlot(session.advocate.merge, entry.cost);
          break;
        case "prosecutor-analysis":
          addToSlot(session.prosecutor.analysis, entry.cost);
          break;
        case "prosecutor-merge":
          addToSlot(session.prosecutor.merge, entry.cost);
          break;
      }

      // Daily aggregation (cross-role)
      if (!result.daily[date]) {
        result.daily[date] = emptyDaily();
      }
      const day = result.daily[date];
      day.totalCost += entry.cost;
      day.totalCalls += 1;
      switch (entry.type) {
        case "judge":
          addToSlot(day.judge, entry.cost);
          break;
        case "advocate-analysis":
          addToSlot(day.advocate.analysis, entry.cost);
          break;
        case "advocate-merge":
          addToSlot(day.advocate.merge, entry.cost);
          break;
        case "prosecutor-analysis":
          addToSlot(day.prosecutor.analysis, entry.cost);
          break;
        case "prosecutor-merge":
          addToSlot(day.prosecutor.merge, entry.cost);
          break;
      }
    }
  }

  if (cwd) {
    const projectDir = join(costsDir, encodeProjectDir(cwd));
    if (existsSync(projectDir)) {
      const files = readdirSync(projectDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const sessionId = basename(file.name, ".jsonl");
        processFile(join(projectDir, file.name), sessionId);
      }
    }
  } else {
    if (!existsSync(costsDir)) return result;
    const entries = readdirSync(costsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = join(costsDir, entry.name);
      const files = readdirSync(projectDir, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const sessionId = basename(file.name, ".jsonl");
        processFile(join(projectDir, file.name), sessionId);
      }
    }
  }

  // Build sorted model list
  result.models = Array.from(modelMap.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.totalCost - a.totalCost);

  // Build sorted session list
  result.sessions = Array.from(sessionMap.values()).sort(
    (a, b) => a.firstTs.localeCompare(b.firstTs),
  );

  return result;
}
