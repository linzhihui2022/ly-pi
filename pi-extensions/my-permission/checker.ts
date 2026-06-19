import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MergedConfig, PermissionAction } from "./config.js";
import { matchGlob } from "./matcher.js";
import type { SessionState } from "./session-state.js";

const MY_PERMISSION_DIRS = [
  path.join(os.homedir(), ".pi", "agent", "extensions", "my-permission"),
  path.join(os.homedir(), ".pi", "agent", "my-permission"),
];

export interface CheckInput {
  toolName: string;
  command?: string;
  path?: string;
  skillName?: string;
  isExternal?: boolean;
}

export interface CheckResult {
  state: PermissionAction;
  origin: "session" | "project" | "global" | "default" | "yolo";
  matchedPattern?: string;
  surface: string;
  value: string;
}

/**
 * Normalize a bash command for pattern matching.
 *
 * 1. Trim leading/trailing whitespace.
 * 2. Collapse consecutive whitespace.
 * 3. Split into tokens on unquoted whitespace, preserving quoted strings.
 * 4. Strip leading environment-variable assignments.
 */
export function normalizeBashCommand(command: string): string | undefined {
  const trimmed = command.trim();
  if (trimmed.length === 0) return undefined;

  const tokens = tokenize(trimmed);
  const withoutEnv: string[] = [];
  for (const token of tokens) {
    if (isEnvAssignment(token) && withoutEnv.length === 0) {
      continue;
    }
    withoutEnv.push(token);
  }

  if (withoutEnv.length === 0) return undefined;
  return withoutEnv.join(" ");
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (const char of input) {
    if (inQuote) {
      current += char;
      if (char === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      current += char;
      inQuote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function isEnvAssignment(token: string): boolean {
  const index = token.indexOf("=");
  if (index <= 0) return false;
  const name = token.slice(0, index);
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Determine whether a target path lies outside the given cwd.
 * Symlinks are resolved. Paths under the my-permission extension directory
 * are always treated as internal.
 */
export function isExternal(cwd: string, target: string): boolean {
  const resolvedTarget = path.resolve(cwd, target);
  if (MY_PERMISSION_DIRS.some((d) => resolvedTarget.startsWith(d + path.sep))) {
    return false;
  }

  let realTarget: string;
  try {
    realTarget = fs.realpathSync(resolvedTarget);
  } catch {
    realTarget = resolvedTarget;
  }

  let realCwd: string;
  try {
    realCwd = fs.realpathSync(cwd);
  } catch {
    realCwd = cwd;
  }

  const rel = path.relative(realCwd, realTarget);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

export interface PermissionChecker {
  check(input: CheckInput): CheckResult;
}

export function createPermissionChecker(
  config: MergedConfig,
  sessionState: SessionState,
): PermissionChecker {
  function findSessionRule(surface: string, value: string): PermissionAction | undefined {
    const rule = sessionState.findSessionRule(surface, value);
    return rule?.action;
  }

  function findAction(surface: string, value: string): CheckResult | undefined {
    const sessionAction = findSessionRule(surface, value);
    if (sessionAction) {
      return { state: sessionAction, origin: "session", surface, value };
    }

    const rules = config[surface as keyof MergedConfig];
    for (const [pattern, action] of Object.entries(rules)) {
      if (matchGlob(pattern, value)) {
        return { state: action, origin: "global", matchedPattern: pattern, surface, value };
      }
    }

    return undefined;
  }

  function checkTool(input: CheckInput): CheckResult | undefined {
    const sessionAction = findSessionRule("tools", input.toolName);
    if (sessionAction) {
      return { state: sessionAction, origin: "session", surface: "tools", value: input.toolName };
    }

    const toolAction = config.tools[input.toolName];
    if (toolAction) {
      return { state: toolAction, origin: "global", matchedPattern: input.toolName, surface: "tools", value: input.toolName };
    }

    return undefined;
  }

  function checkBash(input: CheckInput): CheckResult | undefined {
    if (!input.command) return undefined;
    const normalized = normalizeBashCommand(input.command);
    if (!normalized) return undefined;

    const result = findAction("bash", normalized);
    if (result) return result;

    // Bash patterns ending in ` *` should also match the command without
    // trailing arguments (e.g. `git status *` matches `git status`).
    for (const [pattern, action] of Object.entries(config.bash)) {
      if (pattern.endsWith(" *") && normalized.startsWith(pattern.slice(0, -2))) {
        return { state: action, origin: "global", matchedPattern: pattern, surface: "bash", value: normalized };
      }
    }

    return undefined;
  }

  function checkPath(input: CheckInput): CheckResult | undefined {
    if (input.path === undefined) return undefined;

    const relativePath = path.relative(".", input.path);
    const value = relativePath === "" ? input.path : relativePath;

    const result = findAction("paths", value);
    if (result) return result;

    if (input.isExternal ?? isExternal(".", input.path)) {
      return {
        state: config.external,
        origin: "global",
        matchedPattern: "external",
        surface: "external",
        value,
      };
    }

    return undefined;
  }

  function checkSkill(input: CheckInput): CheckResult | undefined {
    if (!input.skillName) return undefined;
    return findAction("skills", input.skillName);
  }

  function applyYolo(result: CheckResult): CheckResult {
    if (sessionState.yolo && result.state === "ask") {
      return { ...result, state: "allow", origin: "yolo" };
    }
    return result;
  }

  return {
    check(input: CheckInput): CheckResult {
      let result: CheckResult | undefined = checkTool(input);
      if (!result) result = checkBash(input);
      if (!result) result = checkPath(input);
      if (!result) result = checkSkill(input);

      if (!result) {
        result = {
          state: config.default,
          origin: "default",
          matchedPattern: "*",
          surface: "default",
          value: "*",
        };
      }

      return applyYolo(result);
    },
  };
}
