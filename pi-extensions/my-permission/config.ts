import { readFile } from "node:fs/promises";
import type { Action, Config } from "./types";

const ACTIONS: Action[] = ["allow", "ask", "deny"];

function createDefaultConfig(): Config {
  return {
    defaultPolicy: "ask",
    judgeModel: "deepseek/deepseek-v4-flash",
    professorModel: "deepseek/deepseek-v4-pro",
    professorThinking: "max",
    judgeTimeoutMs: 8000,
    childPolicy: "deny-on-unsafe",
    permission: {},
  };
}

function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTIONS.includes(value as Action);
}

function isValidChildPolicy(
  value: unknown,
): value is "deny-on-unsafe" | "allow-on-safe" {
  return value === "deny-on-unsafe" || value === "allow-on-safe";
}

function isValidPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && isFinite(value) && value >= 0;
}

export async function loadConfig(configPath: string): Promise<Config> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(
        `[my-permission] invalid config at ${configPath}, using defaults`,
      );
      return createDefaultConfig();
    }
    const p = parsed as Record<string, unknown>;
    const def = createDefaultConfig();
    return {
      defaultPolicy: isAction(p.defaultPolicy)
        ? p.defaultPolicy
        : def.defaultPolicy,
      judgeModel:
        typeof p.judgeModel === "string" ? p.judgeModel : def.judgeModel,
      professorModel:
        typeof p.professorModel === "string"
          ? p.professorModel
          : def.professorModel,
      professorThinking:
        typeof p.professorThinking === "string"
          ? p.professorThinking
          : def.professorThinking,
      judgeTimeoutMs: isValidPositiveNumber(p.judgeTimeoutMs)
        ? p.judgeTimeoutMs
        : def.judgeTimeoutMs,
      childPolicy: isValidChildPolicy(p.childPolicy)
        ? p.childPolicy
        : def.childPolicy,
      permission:
        p.permission &&
        typeof p.permission === "object" &&
        !Array.isArray(p.permission)
          ? (p.permission as Config["permission"])
          : def.permission,
    };
  } catch (error) {
    console.warn(
      `[my-permission] failed to load config at ${configPath}, using defaults: ${error}`,
    );
    return createDefaultConfig();
  }
}
