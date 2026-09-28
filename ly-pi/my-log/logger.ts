/**
 * Logger module for pi extension development.
 *
 * Stores log entries as session custom entries (customType: "ly-log")
 * and provides a simple factory API with write-function injection.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  source: string;
  msg: string;
  data?: unknown;
}

export type WriteFn = (entry: LogEntry) => void;

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(source: string, write: WriteFn): Logger {
  return {
    debug(msg, data) {
      write({ level: "debug", source, msg, data });
    },
    info(msg, data) {
      write({ level: "info", source, msg, data });
    },
    warn(msg, data) {
      write({ level: "warn", source, msg, data });
    },
    error(msg, data) {
      write({ level: "error", source, msg, data });
    },
  };
}
