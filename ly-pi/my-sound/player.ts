import { join } from "node:path";
import { spawnSoundProcess } from "./coordinator";
import type { SoundConfig } from "./types";

/**
 * List all available sound categories with their descriptions.
 */
export function listCategories(
  config: SoundConfig,
): { name: string; description: string }[] {
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

export function pickSoundFile(
  config: SoundConfig,
  category: string,
): string | undefined {
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
export function resolveSoundPath(soundDir: string, file: string): string {
  return join(soundDir, file);
}

/**
 * Play a sound file using afplay (macOS).
 * Fire-and-forget — resolves immediately.
 * Errors are reported via the optional onError callback instead of stderr.
 */
export function playSound(config: SoundConfig, filePath: string): void {
  spawnSoundProcess(config, filePath);
}

/**
 * Play a category's sound (picks file, resolves path, plays fire-and-forget).
 * Errors are reported via the optional onError callback.
 */
export function playCategory(
  config: SoundConfig,
  soundDir: string,
  category: string,
  _onError?: (message: string) => void,
): void {
  const file = pickSoundFile(config, category);
  if (!file) return;
  playSound(config, resolveSoundPath(soundDir, file));
}
