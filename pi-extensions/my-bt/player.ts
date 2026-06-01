import { join } from "node:path";
import { exec } from "node:child_process";
import type { BtCategory, BtConfig } from "./types";

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
