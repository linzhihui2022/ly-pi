import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

interface SubagentCallRecord {
  timestamp: string;
  eventName: string;
  callType: "single" | "parallel" | "chain" | "action" | "unknown";
  agent?: string;
  agents?: string[];
  action?: string;
  taskCount?: number;
  chainLength?: number;
  context?: string;
  async?: boolean;
  resultStatus?: "success" | "error" | "pending";
}

interface MonitorConfig {
  enabled: boolean;
  logFile: string;
  debugLog: string;
}

function getDefaultLogPath(): string {
  return join(homedir(), ".pi", "agent", "subagent-monitor-log.jsonl");
}

function getDefaultDebugPath(): string {
  return join(homedir(), ".pi", "agent", "subagent-monitor-debug.log");
}

function loadConfig(): MonitorConfig {
  const configPath = join(__dirname, "config.json");
  if (!existsSync(configPath)) {
    return { enabled: true, logFile: getDefaultLogPath(), debugLog: getDefaultDebugPath() };
  }
  const raw = readFileSync(configPath, "utf-8");
  return { enabled: true, logFile: getDefaultLogPath(), debugLog: getDefaultDebugPath(), ...JSON.parse(raw) };
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function debugLog(config: MonitorConfig, message: string): void {
  ensureDir(config.debugLog);
  appendFileSync(config.debugLog, `[${new Date().toISOString()}] ${message}\n`, { flag: "a" });
}

function appendRecord(config: MonitorConfig, record: SubagentCallRecord): void {
  ensureDir(config.logFile);
  const line = JSON.stringify(record) + "\n";
  writeFileSync(config.logFile, line, { flag: "a" });
}

function readRecords(logFile: string): SubagentCallRecord[] {
  if (!existsSync(logFile)) return [];
  const content = readFileSync(logFile, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

function detectCallType(args: Record<string, unknown>): SubagentCallRecord["callType"] {
  if (!args) return "unknown";
  if (args.action) return "action";
  if (Array.isArray(args.chain) && (args.chain as unknown[]).length > 0) return "chain";
  if (Array.isArray(args.tasks) && (args.tasks as unknown[]).length > 0) return "parallel";
  if (args.agent || args.task) return "single";
  return "unknown";
}

function extractAgents(args: Record<string, unknown>): { agent?: string; agents?: string[] } {
  if (!args) return {};
  if (typeof args.agent === "string") return { agent: args.agent };
  if (Array.isArray(args.tasks)) {
    const agents = (args.tasks as Array<{ agent?: string }>)
      .map((t) => t.agent)
      .filter((a): a is string => typeof a === "string");
    return { agents };
  }
  if (Array.isArray(args.chain)) {
    const agents = (args.chain as Array<{ agent?: string }>)
      .map((t) => t.agent)
      .filter((a): a is string => typeof a === "string");
    return { agents };
  }
  return {};
}

function createRecord(eventName: string, args: Record<string, unknown>, resultStatus?: string): SubagentCallRecord {
  const callType = detectCallType(args);
  const { agent, agents } = extractAgents(args);
  return {
    timestamp: new Date().toISOString(),
    eventName,
    callType,
    agent,
    agents,
    action: typeof args.action === "string" ? args.action : undefined,
    taskCount: Array.isArray(args.tasks) ? args.tasks.length : undefined,
    chainLength: Array.isArray(args.chain) ? args.chain.length : undefined,
    context: typeof args.context === "string" ? args.context : undefined,
    async: typeof args.async === "boolean" ? args.async : undefined,
    resultStatus: resultStatus as any,
  };
}

function formatStats(records: SubagentCallRecord[]): string {
  if (records.length === 0) return "📊 No subagent calls recorded yet.";

  const total = records.length;
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byEvent: Record<string, number> = {};

  for (const r of records) {
    byType[r.callType] = (byType[r.callType] || 0) + 1;
    byEvent[r.eventName] = (byEvent[r.eventName] || 0) + 1;
    if (r.agent) byAgent[r.agent] = (byAgent[r.agent] || 0) + 1;
    if (r.agents) {
      for (const a of r.agents) byAgent[a] = (byAgent[a] || 0) + 1;
    }
  }

  const lines: string[] = [
    "📊 Subagent Call Statistics (global)",
    "",
    `Total calls: ${total}`,
    "",
    "By call type:",
    ...Object.entries(byType).map(([t, c]) => `  ${t}: ${c}`),
    "",
    "By agent:",
    ...Object.entries(byAgent).sort((a, b) => b[1] - a[1]).map(([a, c]) => `  ${a}: ${c}`),
    "",
    "By event source:",
    ...Object.entries(byEvent).map(([e, c]) => `  ${e}: ${c}`),
  ];

  return lines.join("\n");
}

export default function subagentMonitor(pi: ExtensionAPI): void {
  const config = loadConfig();
  if (!config.enabled) {
    debugLog(config, "Monitor disabled in config");
    return;
  }

  debugLog(config, "=== pi-subagent-monitor starting ===");

  // ── Hook: tool_execution_start ──
  pi.on("tool_execution_start", (event: Record<string, unknown>) => {
    try {
      const toolName = (event as any).tool?.name;
      if (toolName !== "subagent") return;

      const args = (event as any).tool?.arguments || {};
      const record = createRecord("tool_execution_start", args, "pending");
      appendRecord(config, record);
    } catch (err) {
      debugLog(config, `Error: ${err}`);
    }
  });

  // ── Hook: tool_execution_end ──
  pi.on("tool_execution_end", (event: Record<string, unknown>) => {
    try {
      const toolName = (event as any).tool?.name;
      if (toolName !== "subagent") return;

      const args = (event as any).tool?.arguments || {};
      const error = (event as any).error;
      const resultStatus = error ? "error" : "success";

      const record = createRecord("tool_execution_end", args, resultStatus);
      appendRecord(config, record);
    } catch (err) {
      debugLog(config, `Error: ${err}`);
    }
  });

  // ── Hook: tool_call (fallback) ──
  pi.on("tool_call", (event: Record<string, unknown>) => {
    try {
      const toolName = (event as any).tool?.name;
      if (toolName !== "subagent") return;

      const args = (event as any).tool?.arguments || {};
      const record = createRecord("tool_call", args, "pending");
      appendRecord(config, record);
    } catch (err) {
      debugLog(config, `Error: ${err}`);
    }
  });

  // ── Hook: tool_result (fallback) ──
  pi.on("tool_result", (event: Record<string, unknown>) => {
    try {
      const toolName = (event as any).tool?.name;
      if (toolName !== "subagent") return;

      const args = (event as any).tool?.arguments || {};
      const error = (event as any).error;
      const resultStatus = error ? "error" : "success";

      const record = createRecord("tool_result", args, resultStatus);
      appendRecord(config, record);
    } catch (err) {
      debugLog(config, `Error: ${err}`);
    }
  });

  // ── Register commands ──
  pi.registerCommand("subagent-stats", {
    description: "Show global subagent call statistics",
    handler: async (_args: string | undefined, ctx: ExtensionContext) => {
      const records = readRecords(config.logFile);
      const stats = formatStats(records);
      ctx.ui.notify(stats, "info");
    },
  });

  pi.registerCommand("subagent-clear", {
    description: "Clear subagent call log",
    handler: async (_args: string | undefined, ctx: ExtensionContext) => {
      if (existsSync(config.logFile)) {
        writeFileSync(config.logFile, "", { flag: "w" });
        ctx.ui.notify("🗑️ Subagent call log cleared.", "info");
      } else {
        ctx.ui.notify("📭 No log file to clear.", "info");
      }
    },
  });

  pi.registerCommand("subagent-debug", {
    description: "Show last 20 debug log entries",
    handler: async (_args: string | undefined, ctx: ExtensionContext) => {
      if (!existsSync(config.debugLog)) {
        ctx.ui.notify("No debug log found.", "info");
        return;
      }
      const lines = readFileSync(config.debugLog, "utf-8").trim().split("\n").slice(-20);
      ctx.ui.notify(lines.join("\n") || "Empty debug log.", "info");
    },
  });

  debugLog(config, "=== pi-subagent-monitor hooks registered ===");
}
