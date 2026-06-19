import * as fs from "node:fs";
import * as path from "node:path";

export type LogEntry = Record<string, unknown>;

export interface LoggerOptions {
  logsDir: string;
  debugBufferThreshold?: number;
}

export interface Logger {
  logReview(entry: LogEntry): void;
  logDebug(entry: LogEntry): void;
  setDebugEnabled(enabled: boolean): void;
  flush(): void;
}

export function createLogger(options: LoggerOptions): Logger {
  const debugBufferThreshold = options.debugBufferThreshold ?? 100;
  const debugBuffer: LogEntry[] = [];
  let debugEnabled = false;

  function ensureLogsDir(): void {
    fs.mkdirSync(options.logsDir, { recursive: true });
  }

  function appendJsonl(fileName: string, entries: LogEntry[]): void {
    if (entries.length === 0) return;
    ensureLogsDir();
    const filePath = path.join(options.logsDir, fileName);
    const lines =
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    fs.appendFileSync(filePath, lines, "utf-8");
  }

  return {
    logReview(entry: LogEntry): void {
      appendJsonl("review.jsonl", [entry]);
    },

    logDebug(entry: LogEntry): void {
      if (!debugEnabled) return;
      debugBuffer.push(entry);
      if (debugBuffer.length >= debugBufferThreshold) {
        this.flush();
      }
    },

    setDebugEnabled(enabled: boolean): void {
      debugEnabled = enabled;
    },

    flush(): void {
      appendJsonl("debug.jsonl", debugBuffer);
      debugBuffer.length = 0;
    },
  };
}
