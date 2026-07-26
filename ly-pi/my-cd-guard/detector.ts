export interface CdStripResult {
  /** Rewritten command with the redundant cd prefix removed. */
  command: string;
  /** The exact prefix text that was removed (for user notification). */
  stripped: string;
}

export type Realpath = (path: string) => string;

const identity: Realpath = (p) => p;

const LEADING_CD_RE =
  /^\s*cd\s+(?:"([^"]*)"|'([^']*)'|([^;&\s]+))\s*(&&|;)?\s*/;

function normalizeTarget(raw: string, cwd: string): string {
  let target = raw;
  if (target === "." || target === "./") target = cwd;
  if (target.length > 1) target = target.replace(/\/+$/, "");
  return target;
}

function safeRealpath(path: string, realpath: Realpath): string {
  try {
    return realpath(path);
  } catch {
    return path;
  }
}

export function stripRedundantCd(
  command: string,
  cwd: string,
  realpath: Realpath = identity,
): CdStripResult | undefined {
  const match = LEADING_CD_RE.exec(command);
  if (!match) return undefined;
  const target = normalizeTarget(match[1] ?? match[2] ?? match[3], cwd);
  if (safeRealpath(target, realpath) !== safeRealpath(cwd, realpath)) {
    return undefined;
  }
  const hasMore = match[4] !== undefined;
  const rest = hasMore ? command.slice(match[0].length) : "";
  return {
    command: rest.trim().length > 0 ? rest : "true",
    stripped: match[0],
  };
}
