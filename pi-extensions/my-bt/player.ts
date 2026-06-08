import { join, resolve } from "node:path";
import { exec } from "node:child_process";
import type { BtCategory, BtConfig, OverlayColor } from "./types";

/**
 * List all available sound categories with their descriptions.
 */
export function listCategories(config: BtConfig): { name: string; description: string }[] {
  return Object.entries(config.categories).map(([name, cat]) => ({
    name,
    description: cat.description,
  }));
}

/**
 * Pick a random sound file from a category.
 * Uses a simple round-robin to avoid repeats.
 */
const lastPicked: Record<string, number> = {};

// ═══ Overlay notification ═══

/** Slot counter for vertical stacking (0–4, wraps) */
let overlaySlot = 0;
const MAX_OVERLAY_SLOTS = 5;

/** Color mapping: event name → overlay accent color */
const EVENT_COLOR_MAP: Record<string, OverlayColor> = {
  session_start: "blue",
  agent_start: "orange",
  agent_end: "green",
};

/**
 * Show overlay notification for a pi event.
 * Spawns osascript with the compiled JXA script.
 * No-ops silently when overlayTextMap is missing or event has no config.
 */
export function playOverlay(
  config: BtConfig,
  eventName: string,
  extDir: string,
): void {
  if (!config.overlayTextMap) return;

  const textConfig = config.overlayTextMap[eventName];
  if (!textConfig) return;

  const color = EVENT_COLOR_MAP[eventName] ?? "blue";
  const duration = 3;
  const slot = overlaySlot % MAX_OVERLAY_SLOTS;
  overlaySlot++;

  const scriptPath = resolve(extDir, "dist", "mac-overlay.js");
  exec(
    `osascript -l JavaScript "${scriptPath}" ` +
      `"${textConfig.type}" "${textConfig.title}" "${textConfig.subtitle ?? ""}" ` +
      `${duration} "${color}" ${slot}`,
    (error) => {
      if (error) {
        console.error(`[my-bt] Overlay failed: ${error.message}`);
      }
    },
  );
}

export function pickSoundFile(config: BtConfig, category: string): string | undefined {
  const cat = config.categories[category];
  if (!cat || cat.files.length === 0) return undefined;

  if (cat.files.length === 1) return cat.files[0];

  // Round-robin: pick next file after the last one picked for this category
  const prev = lastPicked[category] ?? -1;
  const next = (prev + 1) % cat.files.length;
  lastPicked[category] = next;
  return cat.files[next];
}

/**
 * Resolve a sound file name to its full path.
 */
export function resolveSoundPath(config: BtConfig, file: string): string {
  return join(config.soundDir, file);
}

/**
 * Play a sound file using afplay (macOS).
 * Fire-and-forget — resolves immediately, logs errors to stderr.
 */
export function playSound(filePath: string): void {
  exec(`afplay "${filePath}"`, (error) => {
    if (error) {
      console.error(`[my-bt] Failed to play: ${filePath} — ${error.message}`);
    }
  });
}

/**
 * Play a category's sound (picks file, resolves path, plays fire-and-forget).
 */
export function playCategory(config: BtConfig, category: string): void {
  const file = pickSoundFile(config, category);
  if (!file) return;
  playSound(resolveSoundPath(config, file));
}
