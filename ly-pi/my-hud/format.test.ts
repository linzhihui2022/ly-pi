import { afterEach, describe, expect, it } from "vitest";
import {
  formatCacheRate,
  formatTokens,
  setModelShortNames,
  shortModelName,
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

describe("shortModelName", () => {
  afterEach(() => {
    setModelShortNames({});
  });

  it("returns builtin short name for known model", () => {
    expect(shortModelName("kimi-for-coding")).toBe("k-coding");
  });

  it("returns raw name when unmapped", () => {
    expect(shortModelName("some-other-model")).toBe("some-other-model");
  });

  it("returns user-configured short name", () => {
    setModelShortNames({ "example/model": "short" });
    expect(shortModelName("example/model")).toBe("short");
  });

  it("user mapping overrides builtin", () => {
    setModelShortNames({ "kimi-for-coding": "kc" });
    expect(shortModelName("kimi-for-coding")).toBe("kc");
  });

  it("keeps builtin mapping for models not in user config", () => {
    setModelShortNames({ "example/model": "short" });
    expect(shortModelName("deepseek-v4-pro")).toBe("ds-pro");
  });
});
