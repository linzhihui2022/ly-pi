/**
 * Read pi's hideThinkingBlock setting from the global settings file
 * (~/.pi/agent/settings.json) with an mtime cache, so the HUD shows the
 * current "Hide thinking" state without re-reading the file on every render.
 *
 * Pi's extension API does not expose this setting and emits no event when it
 * changes — the toggle writes the file synchronously, so polling the mtime is
 * cheap and reliable.
 */

import { readFileSync, statSync } from "node:fs";

let cached: { path: string; mtimeMs: number; value: boolean } | null = null;

/** Whether "Hide thinking" is currently enabled. False on any error. */
export function getHideThinking(settingsPath: string): boolean {
  try {
    const { mtimeMs } = statSync(settingsPath);
    if (cached && cached.path === settingsPath && cached.mtimeMs === mtimeMs) {
      return cached.value;
    }
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      hideThinkingBlock?: unknown;
    };
    const value = parsed.hideThinkingBlock === true;
    cached = { path: settingsPath, mtimeMs, value };
    return value;
  } catch {
    return false;
  }
}
