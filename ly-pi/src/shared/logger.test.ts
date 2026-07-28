import { describe, expect, it } from "vitest";
import type { LogEntry, WriteFn } from "./logger";
import { createLogger } from "./logger";

describe("createLogger", () => {
  function captureWrite(): { entries: LogEntry[]; write: WriteFn } {
    const entries: LogEntry[] = [];
    const write: WriteFn = (entry) => entries.push(entry);
    return { entries, write };
  }

  it("debug writes a log entry with level debug", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.debug("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "debug",
      source: "test",
      msg: "hello",
    });
  });

  it("info writes a log entry with level info", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.info("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      source: "test",
      msg: "hello",
    });
  });

  it("warn writes a log entry with level warn", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.warn("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "warn",
      source: "test",
      msg: "hello",
    });
  });

  it("error writes a log entry with level error", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.error("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
      source: "test",
      msg: "hello",
    });
  });

  it("attaches optional data to the entry", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.info("hello", { count: 42 });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      source: "test",
      msg: "hello",
      data: { count: 42 },
    });
  });

  it("data is undefined when not provided", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.info("hello");

    expect(entries[0].data).toBeUndefined();
  });

  it("two different loggers have independent sources", () => {
    const { entries, write } = captureWrite();
    const a = createLogger("mod-a", write);
    const b = createLogger("mod-b", write);

    a.info("from a");
    b.info("from b");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ source: "mod-a", msg: "from a" });
    expect(entries[1]).toMatchObject({ source: "mod-b", msg: "from b" });
  });

  it("write can be called many times", () => {
    const { entries, write } = captureWrite();
    const logger = createLogger("test", write);

    logger.debug("1");
    logger.info("2");
    logger.warn("3");
    logger.error("4");

    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
  });
});
