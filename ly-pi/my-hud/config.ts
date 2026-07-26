/**
 * Optional user configuration for my-hud, loaded from my-hud.json
 * inside the extension directory. Missing or invalid config falls
 * back to defaults silently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface HudConfig {
  modelShortNames: Record<string, string>;
  hiddenFields: string[];
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  modelShortNames: {},
  hiddenFields: [],
};

function isStringMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function loadHudConfig(dir: string): HudConfig {
  try {
    const raw = readFileSync(join(dir, "my-hud.json"), "utf-8");
    const parsed = JSON.parse(raw) as Partial<HudConfig> | null;
    return {
      modelShortNames: isStringMap(parsed?.modelShortNames)
        ? parsed.modelShortNames
        : {},
      hiddenFields: isStringArray(parsed?.hiddenFields)
        ? parsed.hiddenFields
        : [],
    };
  } catch {
    return { ...DEFAULT_HUD_CONFIG };
  }
}
