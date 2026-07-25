/**
 * Text formatting helpers for my-hud.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { icon } from "./icons";

// ── Token formatting (mirrors footer.js:23-28) ──

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ── Context% color (mirrors footer.js:112-119) ──

export function contextColored(
  theme: Theme,
  pct: number | null,
  contextWindow: number | null,
): string {
  if (pct === null) return theme.fg("dim", "--");

  const ctxWindow = contextWindow ? Math.round(contextWindow / 1000) : 0;
  const display = `${Math.round(pct)}%`;

  if (ctxWindow > 500) {
    if (pct > 50) return theme.fg("error", `${icon("context_50")}${display}`);
    if (pct > 20) return theme.fg("warning", `${icon("context_25")}${display}`);
    return theme.fg("accent", `${icon("context_0")}${display}`);
  }

  if (pct > 90) return theme.fg("error", `${icon("context_100")}${display}`);
  if (pct > 70) return theme.fg("warning", `${icon("context_75")}${display}`);
  return theme.fg("accent", `${icon("context_0")}${display}`);
}

// ── Model name shortening ──

const SHORT_NAMES: Record<string, string> = {
  "kimi-k2-thinking": "k-thinking",
  "kimi-for-coding": "k-coding",
  "deepseek-v4-flash": "ds-fls",
  "deepseek-v4-pro": "ds-pro",
  "kimi-for-coding-highspeed": "k-coding-h",
};

let userShortNames: Record<string, string> = {};

/** Install user-configured short names (from my-hud.json); they override builtins. */
export function setModelShortNames(map: Record<string, string>): void {
  userShortNames = { ...map };
}

export function shortModelName(modelName: string): string {
  return userShortNames[modelName] ?? SHORT_NAMES[modelName] ?? modelName;
}

/**
 * Format judge permission stats as `allowed/denied`.
 * Returns empty string when no stats.
 */
export function formatPermissionStats(
  stats: { allowed: number; denied: number } | undefined,
): string {
  if (!stats) return "";
  if (stats.allowed === 0 && stats.denied === 0) return "";
  return `${stats.allowed}/${stats.denied}`;
}

/**
 * Format cache hit rate as a percentage.
 * cacheRead / (cacheRead + input), rounded to nearest integer.
 */
export function formatCacheRate(input: number, cacheRead: number): string {
  const total = cacheRead + input;
  if (total === 0) return "0%";
  return `${Math.round((cacheRead / total) * 100)}%`;
}
