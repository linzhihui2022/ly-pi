import { describe, expect, it } from "vitest";
import { ANSI, style } from "./ansi";

describe("ANSI", () => {
  it("contains all expected codes", () => {
    expect(ANSI.reset).toBe("\x1b[0m");
    expect(ANSI.bold).toBe("\x1b[1m");
    expect(ANSI.red).toBe("\x1b[31m");
    expect(ANSI.green).toBe("\x1b[32m");
    expect(ANSI.yellow).toBe("\x1b[33m");
    expect(ANSI.cyan).toBe("\x1b[36m");
  });
});

describe("style", () => {
  it("wraps text with codes and reset", () => {
    const result = style("hello", ANSI.red, ANSI.bold);
    expect(result).toBe(`${ANSI.red}${ANSI.bold}hello${ANSI.reset}`);
  });

  it("works with a single code", () => {
    const result = style("hello", ANSI.cyan);
    expect(result).toBe(`${ANSI.cyan}hello${ANSI.reset}`);
  });

  it("works with no codes", () => {
    const result = style("hello");
    expect(result).toBe(`hello${ANSI.reset}`);
  });
});
