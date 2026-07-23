import type { Config, Action } from "./types";
import { readFile } from "node:fs/promises";

const DEFAULT_CONFIG: Config = {
  defaultPolicy: "ask",
  judgeModel: "deepseek/deepseek-v4-flash",
  judgeTimeoutMs: 8000,
  childPolicy: "deny-on-unsafe",
  permission: {},
};

const ACTIONS: Action[] = ["allow", "ask", "deny"];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTIONS.includes(value as Action);
}

export async function loadConfig(configPath: string): Promise<Config> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      console.warn(`[my-permission] invalid config at ${configPath}, using defaults`);
      return DEFAULT_CONFIG;
    }
    const p = parsed as Record<string, unknown>;
    return {
      defaultPolicy: isAction(p.defaultPolicy) ? p.defaultPolicy : DEFAULT_CONFIG.defaultPolicy,
      judgeModel: typeof p.judgeModel === "string" ? p.judgeModel : DEFAULT_CONFIG.judgeModel,
      judgeTimeoutMs: typeof p.judgeTimeoutMs === "number" ? p.judgeTimeoutMs : DEFAULT_CONFIG.judgeTimeoutMs,
      childPolicy: p.childPolicy === "allow-on-safe" ? "allow-on-safe" : DEFAULT_CONFIG.childPolicy,
      permission:
        p.permission && typeof p.permission === "object"
          ? (p.permission as Config["permission"])
          : DEFAULT_CONFIG.permission,
    };
  } catch (error) {
    console.warn(`[my-permission] failed to load config at ${configPath}, using defaults: ${error}`);
    return DEFAULT_CONFIG;
  }
}
