import { describe, expect, it } from "vitest";
import {
  formatCacheRate,
  formatPermissionStats,
  formatTokens,
} from "./format";

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

describe("formatPermissionStats", () => {
  it("returns empty string when stats are undefined", () => {
    expect(formatPermissionStats(undefined)).toBe("");
  });

  it("returns empty string when both counts are zero", () => {
    expect(formatPermissionStats({ allowed: 0, denied: 0 })).toBe("");
  });

  it("returns allowed/denied pair", () => {
    expect(formatPermissionStats({ allowed: 12, denied: 3 })).toBe("12/3");
  });
});
