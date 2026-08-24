import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;

export interface ResolveToolPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
}

function normalizeWindowsShellPath(filePath: string): string {
  if (
    !filePath.startsWith("/") ||
    filePath.startsWith("//") ||
    filePath.includes("\\")
  ) {
    return filePath;
  }
  const match = filePath.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
  if (!match) {
    return filePath;
  }
  const suffix = match[2]?.replaceAll("/", "\\");
  return `${match[1].toUpperCase()}:\\${suffix ?? ""}`;
}

/** Resolve a tool path with the same normalization rules as Pi's native tools. */
export function resolveToolPath(
  rawPath: string,
  cwd: string,
  options: ResolveToolPathOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === "win32" ? win32 : posix;
  let normalized = rawPath.replace(UNICODE_SPACES, " ");

  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  if (platform === "win32") {
    normalized = normalizeWindowsShellPath(normalized);
  }

  const home = options.homeDir ?? homedir();
  if (normalized === "~") {
    normalized = home;
  } else if (
    normalized.startsWith("~/") ||
    (platform === "win32" && normalized.startsWith("~\\"))
  ) {
    normalized = pathApi.join(home, normalized.slice(2));
  }

  if (/^file:\/\//.test(normalized)) {
    normalized = fileURLToPath(normalized);
  }

  return pathApi.isAbsolute(normalized)
    ? pathApi.resolve(normalized)
    : pathApi.resolve(cwd, normalized);
}
