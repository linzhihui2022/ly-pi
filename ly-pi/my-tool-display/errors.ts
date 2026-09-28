import { log } from "./logger";
import { sanitizeToolOutput } from "./sanitize";

const EXPECTED_PREVIEW_ERROR_CODES = new Set([
  "EACCES",
  "EAGAIN",
  "EINTR",
  "EISDIR",
  "ELOOP",
  "ENAMETOOLONG",
  "ENODEV",
  "ENOENT",
  "ENOTDIR",
  "ENXIO",
  "EOVERFLOW",
  "EPERM",
]);

export function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

export function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}

export function logUnexpectedPreviewError(
  message: string,
  error: unknown,
): void {
  const code = getErrorCode(error);
  if (code && EXPECTED_PREVIEW_ERROR_CODES.has(code)) {
    return;
  }
  log.error(message, { error: serializeError(error) });
}

export function describeError(error: unknown): string | undefined {
  const code = getErrorCode(error);
  if (error instanceof Error) {
    const message = error.message || error.name;
    return code ? `${code}: ${message}` : message;
  }
  if (typeof error === "string") {
    return error;
  }
  return code;
}

export function withErrorDetails(reason: string, error: unknown): string {
  const details = describeError(error);
  return details ? `${reason} (${sanitizeToolOutput(details)})` : reason;
}
