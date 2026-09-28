import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  getErrorCode,
  logUnexpectedPreviewError,
  withErrorDetails,
} from "./errors";
import { canRoundTripUtf8, isRecord } from "./sanitize";
import type { WriteDiffDetails, WritePreview, WriteToolResult } from "./types";
import { resolveSafeWritePath } from "./write-path";

export const MAX_WRITE_DIFF_BYTES = 1_000_000;

/**
 * Diff details produced while executing the write override, keyed by the
 * result's content object so `renderResult` can display them without the
 * tool result carrying them itself.
 */
export const writeDiffByContent = new WeakMap<object, WriteDiffDetails>();

export function readWritePreview(
  cwd: string,
  rawPath: string,
  nextContent: string,
): WritePreview {
  const safePath = resolveSafeWritePath(cwd, rawPath);
  if (!safePath.safe) {
    return { safe: false, reason: safePath.reason };
  }

  if (Buffer.byteLength(nextContent, "utf8") > MAX_WRITE_DIFF_BYTES) {
    return {
      safe: false,
      reason: `Write diff unavailable because the new content exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
    };
  }
  if (nextContent.includes("\0")) {
    return {
      safe: false,
      reason:
        "Write diff unavailable because the new content appears to be binary.",
    };
  }
  if (!canRoundTripUtf8(nextContent)) {
    return {
      safe: false,
      reason:
        "Write diff unavailable because the new content cannot be represented faithfully as UTF-8.",
    };
  }
  if (!safePath.existed) {
    return {
      safe: true,
      previousContent: "",
      snapshot: { path: safePath.path, existed: false },
    };
  }

  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(
      safePath.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const initialStats = fstatSync(fileDescriptor);
    if (
      !initialStats.isFile() ||
      initialStats.dev !== safePath.device ||
      initialStats.ino !== safePath.inode
    ) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the existing file could not be read safely.",
      };
    }
    if (initialStats.size > MAX_WRITE_DIFF_BYTES) {
      return {
        safe: false,
        reason: `Write diff unavailable because the existing file exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
      };
    }

    const bytes = Buffer.alloc(MAX_WRITE_DIFF_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const read = readSync(
        fileDescriptor,
        bytes,
        bytesRead,
        bytes.length - bytesRead,
        bytesRead,
      );
      if (read === 0) {
        break;
      }
      bytesRead += read;
    }
    const finalStats = fstatSync(fileDescriptor);
    if (
      bytesRead > MAX_WRITE_DIFF_BYTES ||
      finalStats.size > MAX_WRITE_DIFF_BYTES
    ) {
      return {
        safe: false,
        reason: `Write diff unavailable because the existing file exceeds the ${MAX_WRITE_DIFF_BYTES} byte preview limit.`,
      };
    }

    const content = bytes.subarray(0, bytesRead);
    if (content.includes(0)) {
      return {
        safe: false,
        reason:
          "Write diff unavailable because the existing file appears to be binary.",
      };
    }

    let previousContent: string;
    try {
      previousContent = new TextDecoder("utf-8", { fatal: true }).decode(
        content,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) {
        logUnexpectedPreviewError(
          "Unexpected error while decoding write diff preview.",
          error,
        );
      }
      return {
        safe: false,
        reason: withErrorDetails(
          "Write diff unavailable because the existing file contains invalid UTF-8 and could not be read safely.",
          error,
        ),
      };
    }

    return {
      safe: true,
      previousContent,
      snapshot: {
        path: safePath.path,
        existed: true,
        device: finalStats.dev,
        inode: finalStats.ino,
        size: finalStats.size,
        mtimeMs: finalStats.mtimeMs,
      },
    };
  } catch (error) {
    logUnexpectedPreviewError(
      "Unexpected error while reading write diff preview.",
      error,
    );
    return {
      safe: false,
      reason: withErrorDetails(
        "Write diff unavailable because the existing file could not be read safely.",
        error,
      ),
    };
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}

export function isWritePreviewCurrent(
  preview: Extract<WritePreview, { safe: true }>,
): boolean {
  try {
    const stats = lstatSync(preview.snapshot.path);
    if (!preview.snapshot.existed) {
      return false;
    }
    return (
      stats.isFile() &&
      stats.dev === preview.snapshot.device &&
      stats.ino === preview.snapshot.inode &&
      stats.size === preview.snapshot.size &&
      stats.mtimeMs === preview.snapshot.mtimeMs
    );
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ENOENT" && !preview.snapshot.existed) {
      return true;
    }
    if (code !== "ENOENT") {
      logUnexpectedPreviewError(
        "Unexpected error while checking write diff preview freshness.",
        error,
      );
    }
    return false;
  }
}

export function addWriteDiffDetails(
  result: AgentToolResult<unknown>,
  writeDiff: WriteDiffDetails,
): WriteToolResult {
  const nativeDetails = isRecord(result.details) ? result.details : {};
  return {
    ...result,
    details: { ...nativeDetails, writeDiff },
  };
}
