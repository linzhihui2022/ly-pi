/**
 * my-zen mode configuration.
 *
 * - on:  tool calls render one dim line while running, then disappear
 *        entirely once settled (errors and non-zero exit codes still show)
 * - off: my-zen registers nothing; tool rendering is handed back to
 *        pi-tool-display (its registerToolOverrides are re-enabled)
 *
 * Switching modes rewrites both extensions' deployed config files and is
 * followed by ctx.reload(), because tool registration is a load-time act.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ZenMode = "on" | "off";

export interface ZenConfig {
  mode: ZenMode;
}

export const ZEN_MODES: readonly ZenMode[] = ["on", "off"];

export const DEFAULT_ZEN_CONFIG: ZenConfig = { mode: "on" };

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions");

export const ZEN_CONFIG_PATH = join(EXT_DIR, "ly-pi", "my-zen.json");
export const TOOL_DISPLAY_CONFIG_PATH = join(
  EXT_DIR,
  "pi-tool-display",
  "config.json",
);

export const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export const ZEN_THEME_NAME = "catppuccin-mocha-zen";
export const DEFAULT_THEME_NAME = "catppuccin-mocha";

export function expectedThemeForMode(mode: ZenMode): string {
  return mode === "on" ? ZEN_THEME_NAME : DEFAULT_THEME_NAME;
}

/**
 * Keep settings.json's theme aligned with the zen mode. The inverted user
 * message colors live in the zen theme, so switching modes must switch
 * themes too. Returns true when the settings file was rewritten.
 */
export function syncThemeWithMode(
  mode: ZenMode,
  settingsPath: string = SETTINGS_PATH,
): boolean {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return false;
  }
  const expected = expectedThemeForMode(mode);
  if (raw.theme === expected) return false;
  raw.theme = expected;
  writeFileSync(settingsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
  return true;
}

const TOOL_OVERRIDE_KEYS = [
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
] as const;

export function parseZenMode(raw: unknown): ZenMode | undefined {
  return raw === "on" || raw === "off" ? raw : undefined;
}

export function loadZenConfig(configPath: string = ZEN_CONFIG_PATH): ZenConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mode?: unknown;
    };
    const mode = parseZenMode(raw.mode);
    return { mode: mode ?? DEFAULT_ZEN_CONFIG.mode };
  } catch {
    return { ...DEFAULT_ZEN_CONFIG };
  }
}

export function saveZenConfig(configPath: string, config: ZenConfig): void {
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

/**
 * Flip pi-tool-display's registerToolOverrides (all seven built-ins).
 * Returns true when the deployed config file was found and updated.
 */
export function setToolDisplayOverrides(
  enabled: boolean,
  configPath: string = TOOL_DISPLAY_CONFIG_PATH,
): boolean {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return false;
  }
  const ownership = (raw.registerToolOverrides ?? {}) as Record<
    string,
    unknown
  >;
  for (const key of TOOL_OVERRIDE_KEYS) {
    ownership[key] = enabled;
  }
  raw.registerToolOverrides = ownership;
  // pi-tool-display's user message box wraps the same native component we
  // restyle via rebuild; disable it while my-zen is on so its render wrapper
  // passes through to the native render
  raw.enableNativeUserMessageBox = enabled;
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
  return true;
}
