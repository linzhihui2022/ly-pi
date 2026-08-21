import { describe, expect, it } from "vitest";
import { formatCacheRate, formatTokens } from "./format";

describe("formatTokens", () => {
  it("returns raw count under 1000", () => {
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with one decimal", () => {
    expect(formatTokens(1500)).toBe("1.5k");
  });

  it("rounds large thousands", () => {
    expect(formatTokens(123456)).toBe("123k");
  });
});

describe("formatCacheRate", () => {
  it("returns 0% when total is 0", () => {
    expect(formatCacheRate(0, 0)).toBe("0%");
  });

  it("rounds to nearest percent", () => {
    expect(formatCacheRate(100, 25)).toBe("20%");
  });
});
