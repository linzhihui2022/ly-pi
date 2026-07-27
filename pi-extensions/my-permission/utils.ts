import { homedir } from "node:os";
import { resolve } from "node:path";

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
