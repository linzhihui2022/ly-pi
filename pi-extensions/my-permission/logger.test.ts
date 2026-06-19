import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "./logger.js";

let tmpDir: string;
let logger: ReturnType<typeof createLogger>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-permission-"));
  logger = createLogger({ logsDir: tmpDir });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readReviewLines(): LogEntry[] {
  const filePath = path.join(tmpDir, "review.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readDebugLines(): LogEntry[] {
  const filePath = path.join(tmpDir, "debug.jsonl");
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("logReview", () => {
  it("creates the logs directory on first write", () => {
    logger.logReview({ type: "decision", state: "allow" });
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it("appends each entry synchronously", () => {
    logger.logReview({ type: "decision", state: "allow" });
    logger.logReview({ type: "decision", state: "deny" });

    const lines = readReviewLines();
    expect(lines).toHaveLength(2);
    expect(lines[0].state).toBe("allow");
    expect(lines[1].state).toBe("deny");
  });

  it("does not buffer review entries", () => {
    logger.logReview({ type: "decision", state: "allow" });
    // If buffered, the file would be empty until flush.
    expect(readReviewLines()).toHaveLength(1);
  });
});

describe("logDebug", () => {
  it("does not write when debug logging is disabled", () => {
    logger.logDebug({ type: "diagnostic", message: "hello" });
    logger.flush();
    expect(readDebugLines()).toHaveLength(0);
  });

  it("buffers debug entries when enabled", () => {
    logger.setDebugEnabled(true);
    logger.logDebug({ type: "diagnostic", message: "a" });
    expect(readDebugLines()).toHaveLength(0);
  });

  it("flushes debug entries when the buffer reaches the threshold", () => {
    logger = createLogger({ logsDir: tmpDir, debugBufferThreshold: 3 });
    logger.setDebugEnabled(true);
    for (let i = 0; i < 3; i++) {
      logger.logDebug({ type: "diagnostic", index: i });
    }

    const lines = readDebugLines();
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2]);
  });

  it("uses a configurable threshold", () => {
    logger = createLogger({ logsDir: tmpDir, debugBufferThreshold: 5 });
    logger.setDebugEnabled(true);

    for (let i = 0; i < 4; i++) {
      logger.logDebug({ type: "diagnostic", index: i });
    }
    expect(readDebugLines()).toHaveLength(0);

    logger.logDebug({ type: "diagnostic", index: 4 });
    expect(readDebugLines()).toHaveLength(5);
  });

  it("flushes remaining debug entries on explicit flush", () => {
    logger.setDebugEnabled(true);
    logger.logDebug({ type: "diagnostic", message: "a" });
    logger.flush();

    const lines = readDebugLines();
    expect(lines).toHaveLength(1);
  });
});

describe("flush", () => {
  it("is safe to call when nothing was logged", () => {
    expect(() => logger.flush()).not.toThrow();
  });

  it("flushes both review and debug entries", () => {
    logger.logReview({ type: "decision", state: "allow" });
    logger.setDebugEnabled(true);
    logger.logDebug({ type: "diagnostic", message: "a" });
    logger.flush();

    expect(readReviewLines()).toHaveLength(1);
    expect(readDebugLines()).toHaveLength(1);
  });
});
