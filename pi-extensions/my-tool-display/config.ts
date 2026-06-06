import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

export const READ_OUTPUT_MODES = ["hidden", "summary", "preview"] as const;
export const SEARCH_OUTPUT_MODES = ["hidden", "count", "preview"] as const;
export const BASH_OUTPUT_MODES = ["opencode", "summary", "preview"] as const;
export const MCP_OUTPUT_MODES = ["hidden", "summary", "preview"] as const;
export const DIFF_VIEW_MODES = ["auto", "split", "unified"] as const;

export type ReadOutputMode = (typeof READ_OUTPUT_MODES)[number];
export type SearchOutputMode = (typeof SEARCH_OUTPUT_MODES)[number];
export type BashOutputMode = (typeof BASH_OUTPUT_MODES)[number];
export type McpOutputMode = (typeof MCP_OUTPUT_MODES)[number];
export type DiffViewMode = (typeof DIFF_VIEW_MODES)[number];

export interface ToolDisplayConfig {
  readOutputMode: ReadOutputMode;
  searchOutputMode: SearchOutputMode;
  bashOutputMode: BashOutputMode;
  mcpOutputMode: McpOutputMode;
  previewLines: number;
  diffViewMode: DiffViewMode;
  diffCollapsedLines: number;
  thinkingLabelEnabled: boolean;
  userMessageBoxEnabled: boolean;
}

export const DEFAULT_CONFIG: ToolDisplayConfig = {
  readOutputMode: "summary",
  searchOutputMode: "count",
  bashOutputMode: "summary",
  mcpOutputMode: "summary",
  previewLines: 8,
  diffViewMode: "auto",
  diffCollapsedLines: 24,
  thinkingLabelEnabled: true,
  userMessageBoxEnabled: true,
};

// --- Resolve extension directory ---

function getExtensionDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { /* not ESM */ }
  return process.cwd();
}

const CONFIG_PATH = join(getExtensionDir(), "my-tool-display.json");

// --- Config operations ---

export function loadConfig(): ToolDisplayConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: ToolDisplayConfig): boolean {
  try {
    const normalized = normalizeConfig(config);
    writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function normalizeConfig(raw: Record<string, unknown>): ToolDisplayConfig {
  const merged: ToolDisplayConfig = { ...DEFAULT_CONFIG };

  if (typeof raw.readOutputMode === "string" && (READ_OUTPUT_MODES as readonly string[]).includes(raw.readOutputMode)) {
    merged.readOutputMode = raw.readOutputMode as ReadOutputMode;
  }
  if (typeof raw.searchOutputMode === "string" && (SEARCH_OUTPUT_MODES as readonly string[]).includes(raw.searchOutputMode)) {
    merged.searchOutputMode = raw.searchOutputMode as SearchOutputMode;
  }
  if (typeof raw.bashOutputMode === "string" && (BASH_OUTPUT_MODES as readonly string[]).includes(raw.bashOutputMode)) {
    merged.bashOutputMode = raw.bashOutputMode as BashOutputMode;
  }
  if (typeof raw.mcpOutputMode === "string" && (MCP_OUTPUT_MODES as readonly string[]).includes(raw.mcpOutputMode)) {
    merged.mcpOutputMode = raw.mcpOutputMode as McpOutputMode;
  }
  if (typeof raw.previewLines === "number" && Number.isFinite(raw.previewLines)) {
    merged.previewLines = Math.max(1, Math.floor(raw.previewLines));
  }
  if (typeof raw.diffViewMode === "string" && (DIFF_VIEW_MODES as readonly string[]).includes(raw.diffViewMode)) {
    merged.diffViewMode = raw.diffViewMode as DiffViewMode;
  }
  if (typeof raw.diffCollapsedLines === "number" && Number.isFinite(raw.diffCollapsedLines)) {
    merged.diffCollapsedLines = Math.max(1, Math.floor(raw.diffCollapsedLines));
  }
  if (typeof raw.thinkingLabelEnabled === "boolean") {
    merged.thinkingLabelEnabled = raw.thinkingLabelEnabled;
  }
  if (typeof raw.userMessageBoxEnabled === "boolean") {
    merged.userMessageBoxEnabled = raw.userMessageBoxEnabled;
  }

  return merged;
}
