import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { getErrorCode, withErrorDetails } from "./errors";
import { resolveToolPath } from "./path-utils";
import type { RealpathResult, ResolvedWritePath, SafeWritePath } from "./types";

export function isWithinWorkspace(
  workspacePath: string,
  targetPath: string,
): boolean {
  const relativePath = relative(workspacePath, targetPath);
  const isParentPath =
    relativePath === ".." || relativePath.startsWith(`..${sep}`);
  return relativePath === "" || (!isParentPath && !isAbsolute(relativePath));
}

export function realpathOrUndefined(path: string): RealpathResult {
  try {
    return { resolved: true, path: realpathSync(path) };
  } catch (error) {
    return { resolved: false, error };
  }
}

export function resolveWritePath(
  cwd: string,
  rawPath: string,
): ResolvedWritePath {
  try {
    return { resolved: true, path: resolveToolPath(rawPath, cwd) };
  } catch (error) {
    return {
      resolved: false,
      reason: withErrorDetails(
        "Write diff unavailable because the target path cannot be resolved safely.",
        error,
      ),
    };
  }
}

export function resolveSafeWritePath(
  cwd: string,
  rawPath: string,
): SafeWritePath {
  if (!rawPath.trim()) {
    return {
      safe: false,
      reason: "Write diff unavailable because the target path is empty.",
    };
  }

  const workspacePathResult = realpathOrUndefined(cwd);
  if (!workspacePathResult.resolved) {
    return {
      safe: false,
      reason: withErrorDetails(
        "Write diff unavailable because the current workspace cannot be resolved safely.",
        workspacePathResult.error,
      ),
    };
  }
  const workspacePath = workspacePathResult.path;

  const resolved = resolveWritePath(cwd, rawPath);
  if (!resolved.resolved) {
    return { safe: false, reason: resolved.reason };
  }
  const resolvedPath = resolved.path;

  try {
    const targetStat = lstatSync(resolvedPath);
    const targetPathResult = realpathOrUndefined(resolvedPath);
    if (!targetPathResult.resolved) {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target path cannot be resolved safely.",
          targetPathResult.error,
        ),
      };
    }
    const targetPath = targetPathResult.path;
    if (!isWithinWorkspace(workspacePath, targetPath)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path resolves outside the current workspace.",
      };
    }
    if (targetStat.isSymbolicLink()) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path is a symbolic link.",
      };
    }
    if (!targetStat.isFile()) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target path is not a regular file.",
      };
    }
    return {
      safe: true,
      path: resolvedPath,
      existed: true,
      device: targetStat.dev,
      inode: targetStat.ino,
    };
  } catch (error) {
    if (getErrorCode(error) !== "ENOENT") {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target path could not be resolved safely.",
          error,
        ),
      };
    }

    let parentPath = dirname(resolvedPath);
    while (parentPath !== dirname(parentPath) && !existsSync(parentPath)) {
      parentPath = dirname(parentPath);
    }
    const parentPathResult = realpathOrUndefined(parentPath);
    if (!parentPathResult.resolved) {
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the target directory cannot be resolved safely.",
          parentPathResult.error,
        ),
      };
    }
    const parentRealpath = parentPathResult.path;
    if (!isWithinWorkspace(workspacePath, parentRealpath)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the target directory resolves outside the current workspace.",
      };
    }

    return { safe: true, path: resolvedPath, existed: false };
  }
}
