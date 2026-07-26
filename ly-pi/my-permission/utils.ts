import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function expandHome(path: string): string {
  if (path === "~" || path.startsWith("~/")) {
    return path.replace("~", homedir());
  }
  return path;
}

export function resolvePath(path: string, cwd: string): string {
  return resolve(cwd, path);
}

export function isExternalPath(path: string, cwd: string): boolean {
  const absolute =
    path.startsWith("/") || path.startsWith("~")
      ? resolve(expandHome(path))
      : resolve(cwd, path);
  const cwdAbsolute = resolve(cwd);
  return !absolute.startsWith(`${cwdAbsolute}/`) && absolute !== cwdAbsolute;
}

export function splitBashCommandUnits(command: string): string[] {
  const units: string[] = [];
  let current = "";
  let inQuotes: false | '"' | "'" = false;

  for (const char of command) {
    if (inQuotes) {
      current += char;
      if (char === inQuotes) inQuotes = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inQuotes = char;
      current += char;
      continue;
    }
    if (char === "&" || char === "|" || char === ";" || char === "\n") {
      if (current.trim()) units.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) units.push(current.trim());
  return units;
}

export function stripEnvPrefix(unit: string): string {
  const match = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(.*)$/s.exec(unit);
  return match ? match[1] : unit;
}

export function extractPathTokens(command: string, _cwd: string): string[] {
  const tokens = new Set<string>();
  const words = command.split(/\s+/);
  for (const word of words) {
    const trimmed = word.replace(/^["']|["']$/g, "");
    if (
      trimmed.startsWith("/") ||
      trimmed.startsWith("~/") ||
      trimmed.startsWith("./") ||
      trimmed.startsWith("../")
    ) {
      tokens.add(trimmed);
    } else if (trimmed.includes("/")) {
      tokens.add(trimmed);
    } else if (trimmed.startsWith(".") && trimmed.length > 1) {
      tokens.add(trimmed);
    } else if (
      !trimmed.startsWith("-") &&
      /^[a-zA-Z0-9._-]+$/.test(trimmed) &&
      trimmed.length > 1
    ) {
      // bare filename candidate (like id_rsa)
      tokens.add(trimmed);
    }
  }
  return Array.from(tokens);
}

export function stringifyToolInput(event: {
  toolName: string;
  input: Record<string, unknown>;
}): string {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }
  if (
    (event.toolName === "read" ||
      event.toolName === "write" ||
      event.toolName === "edit") &&
    typeof event.input.path === "string"
  ) {
    return event.input.path;
  }
  return JSON.stringify(event.input);
}

export function collectPaths(
  toolName: string,
  value: string,
  event: { toolName: string; input: Record<string, unknown> },
  cwd: string,
): string[] {
  if (toolName === "bash") return extractPathTokens(value, cwd);
  if (
    toolName === "read" ||
    toolName === "write" ||
    toolName === "edit" ||
    toolName === "ls"
  ) {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  if (toolName === "grep" || toolName === "find") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  return [];
}

export function resolveSymlinkedPaths(paths: string[], cwd: string): string[] {
  const resolved = [...paths];
  for (const p of paths) {
    try {
      const full =
        p.startsWith("/") || p.startsWith("~")
          ? join(
              p.startsWith("~") ? (process.env.HOME ?? "/home") : "/",
              p.replace(/^~/, ""),
            )
          : join(cwd, p);
      const real = realpathSync(full);
      if (real !== full) {
        resolved.push(real);
      }
    } catch {
      // symlink resolution failed (e.g. file doesn't exist), skip
    }
  }
  return resolved;
}
