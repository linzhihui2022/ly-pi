import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregateCosts,
  appendCost,
  encodeProjectDir,
  getCostsDir,
  getCostsFilePath,
} from "./cost-tracker";

const TEST_SESSION = "test-session-001";
const TEST_CWD = "/Users/test/my-project";
const TEST_DIR = mkdtempSync(join(tmpdir(), "pi-costs-test-"));
const TEST_COSTS_DIR = join(TEST_DIR, encodeProjectDir(TEST_CWD));
const TEST_FILE = getCostsFilePath(TEST_SESSION, TEST_CWD, TEST_DIR);

function opts() {
  return { costsDir: TEST_DIR };
}

describe("encodeProjectDir", () => {
  it("encodes absolute path to project directory name", () => {
    expect(encodeProjectDir("/Users/lychee/Documents/configure")).toBe(
      "--Users-lychee-Documents-configure--",
    );
  });

  it("handles trailing slash", () => {
    expect(encodeProjectDir("/Users/lychee/Documents/configure/")).toBe(
      "--Users-lychee-Documents-configure--",
    );
  });

  it("handles root path", () => {
    expect(encodeProjectDir("/")).toBe("----");
  });
});

describe("getCostsDir", () => {
  it("returns ~/.pi/costs", () => {
    expect(getCostsDir()).toContain(".pi/costs");
  });
});

describe("getCostsFilePath", () => {
  it("returns path under costs/<project>/<sessionId>.jsonl", () => {
    const filePath = getCostsFilePath(TEST_SESSION, TEST_CWD, TEST_DIR);
    expect(filePath).toContain(encodeProjectDir(TEST_CWD));
    expect(filePath).toContain(`${TEST_SESSION}.jsonl`);
    expect(filePath.endsWith(".jsonl")).toBe(true);
  });

  it("defaults to ~/.pi/costs when no costsDir provided", () => {
    const filePath = getCostsFilePath(TEST_SESSION, TEST_CWD);
    expect(filePath).toContain(".pi/costs/");
  });
});

describe("appendCost", () => {
  beforeEach(() => {
    if (existsSync(TEST_COSTS_DIR)) {
      rmSync(TEST_COSTS_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_COSTS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_COSTS_DIR)) {
      rmSync(TEST_COSTS_DIR, { recursive: true, force: true });
    }
  });

  it("appends a single JSONL line with all fields", () => {
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());

    const content = readFileSync(TEST_FILE, "utf-8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("judge");
    expect(parsed.cost).toBe(0.001);
    expect(parsed.model).toBe("openai/gpt-4o");
    expect(parsed.ts).toBeDefined();
    expect(new Date(parsed.ts).getTime()).toBeGreaterThan(0);
  });

  it("appends multiple lines to the same file", () => {
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    appendCost(TEST_SESSION, TEST_CWD, "advocate-analysis", 0.005, "anthropic/claude-sonnet-4", opts());

    const lines = readFileSync(TEST_FILE, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe("judge");
    expect(JSON.parse(lines[1]).type).toBe("advocate-analysis");
  });

  it("creates parent directories if they do not exist", () => {
    if (existsSync(TEST_COSTS_DIR)) {
      rmSync(TEST_COSTS_DIR, { recursive: true, force: true });
    }

    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    expect(existsSync(TEST_FILE)).toBe(true);
  });

  it("supports all five cost types", () => {
    const types = [
      "judge",
      "advocate-analysis",
      "advocate-merge",
      "prosecutor-analysis",
      "prosecutor-merge",
    ] as const;

    for (const type of types) {
      appendCost(TEST_SESSION, TEST_CWD, type, 0.001, "openai/gpt-4o", opts());
    }

    const lines = readFileSync(TEST_FILE, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(5);
    for (let i = 0; i < types.length; i++) {
      expect(JSON.parse(lines[i]).type).toBe(types[i]);
    }
  });

  it("defaults costsDir to ~/.pi/costs", () => {
    // Use the default path (writes to real ~/.pi/costs)
    // Test that no error is thrown
    expect(() => {
      appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o");
    }).not.toThrow();
    // Clean up
    const defaultFile = getCostsFilePath(TEST_SESSION, TEST_CWD);
    if (existsSync(defaultFile)) {
      rmSync(join(getCostsDir(), encodeProjectDir(TEST_CWD)), { recursive: true, force: true });
    }
  });
});

describe("aggregateCosts", () => {
  beforeEach(() => {
    if (existsSync(TEST_COSTS_DIR)) {
      rmSync(TEST_COSTS_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_COSTS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_COSTS_DIR)) {
      rmSync(TEST_COSTS_DIR, { recursive: true, force: true });
    }
  });

  it("returns empty aggregation when no files exist", () => {
    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge).toEqual({
      totalCost: 0,
      calls: 0,
      byModel: {},
      daily: {},
    });
  });

  it("returns empty aggregation when directory does not exist", () => {
    const result = aggregateCosts("/nonexistent/path", opts());
    expect(result.judge.totalCost).toBe(0);
  });

  it("defaults costsDir when opts is omitted", () => {
    // Should not throw - uses getCostsDir() internally
    const result = aggregateCosts("/nonexistent/path");
    expect(result.judge.totalCost).toBe(0);
  });

  it("returns empty aggregation when costs dir does not exist (no cwd)", () => {
    const result = aggregateCosts(undefined, { costsDir: "/nonexistent/costs/dir" });
    expect(result.judge.totalCost).toBe(0);
  });

  it("aggregates costs across sessions for a project", () => {
    // Session 1
    appendCost("session-1", TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    appendCost("session-1", TEST_CWD, "judge", 0.002, "openai/gpt-4o", opts());

    // Session 2: simulate by writing directly to a different session file
    writeFileSync(
      join(TEST_COSTS_DIR, "session-2.jsonl"),
      [
        JSON.stringify({
          type: "judge",
          cost: 0.003,
          model: "openai/gpt-4o",
          ts: new Date().toISOString(),
        }),
        JSON.stringify({
          type: "advocate-analysis",
          cost: 0.005,
          model: "anthropic/claude-sonnet-4",
          ts: new Date().toISOString(),
        }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());

    // judge: 0.001 + 0.002 + 0.003 = 0.006, 3 calls
    expect(result.judge.totalCost).toBeCloseTo(0.006, 6);
    expect(result.judge.calls).toBe(3);
    expect(result.judge.byModel["openai/gpt-4o"].totalCost).toBeCloseTo(0.006, 6);
    expect(result.judge.byModel["openai/gpt-4o"].calls).toBe(3);

    // advocate-analysis: 0.005, 1 call
    const advAnalysis = result.advocate.analysis;
    expect(advAnalysis.totalCost).toBeCloseTo(0.005, 6);
    expect(advAnalysis.calls).toBe(1);
    expect(advAnalysis.byModel["anthropic/claude-sonnet-4"].totalCost).toBeCloseTo(0.005, 6);
  });

  it("aggregates by daily buckets", () => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    appendCost(TEST_SESSION, TEST_CWD, "prosecutor-analysis", 0.008, "anthropic/claude-sonnet-4", opts());

    const result = aggregateCosts(TEST_CWD, opts());

    expect(result.judge.daily[today].totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.daily[today].calls).toBe(1);

    expect(result.prosecutor.analysis.daily[today].totalCost).toBeCloseTo(0.008, 6);
    expect(result.prosecutor.analysis.daily[today].calls).toBe(1);
  });

  it("skips corrupted JSON lines", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({
          type: "judge",
          cost: 0.001,
          model: "openai/gpt-4o",
          ts: new Date().toISOString(),
        }),
        "this is not valid json",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("skips lines missing required fields", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({ type: "judge", cost: 0.001, model: "openai/gpt-4o", ts: new Date().toISOString() }),
        JSON.stringify({ type: "judge" }),
        JSON.stringify({ cost: 0.001 }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("returns zero-initialized buckets for all five types", () => {
    const result = aggregateCosts(TEST_CWD, opts());

    expect(result.judge).toBeDefined();
    expect(result.judge.totalCost).toBe(0);
    expect(result.judge.calls).toBe(0);

    expect(result.advocate.analysis.totalCost).toBe(0);
    expect(result.advocate.analysis.calls).toBe(0);
    expect(result.advocate.merge.totalCost).toBe(0);
    expect(result.advocate.merge.calls).toBe(0);

    expect(result.prosecutor.analysis.totalCost).toBe(0);
    expect(result.prosecutor.analysis.calls).toBe(0);
    expect(result.prosecutor.merge.totalCost).toBe(0);
    expect(result.prosecutor.merge.calls).toBe(0);
  });

  it("aggregates all projects when cwd is omitted", () => {
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());

    const result = aggregateCosts(undefined, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("skips non-jsonl files in project directory", () => {
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    writeFileSync(join(TEST_COSTS_DIR, "readme.txt"), "hello", "utf-8");

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("skips entries with invalid type field", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({ type: "judge", cost: 0.001, model: "openai/gpt-4o", ts: new Date().toISOString() }),
        JSON.stringify({ type: "invalid-type", cost: 0.005, model: "x", ts: new Date().toISOString() }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("aggregates advocate-merge and prosecutor-merge types", () => {
    appendCost(TEST_SESSION, TEST_CWD, "advocate-merge", 0.002, "anthropic/claude-sonnet-4", opts());
    appendCost(TEST_SESSION, TEST_CWD, "prosecutor-merge", 0.003, "anthropic/claude-sonnet-4", opts());

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.advocate.merge.totalCost).toBeCloseTo(0.002, 6);
    expect(result.advocate.merge.calls).toBe(1);
    expect(result.prosecutor.merge.totalCost).toBeCloseTo(0.003, 6);
    expect(result.prosecutor.merge.calls).toBe(1);
  });

  it("skips non-directory entries in costs dir when aggregating all projects", () => {
    const strayFile = join(TEST_DIR, "stray-file.txt");
    writeFileSync(strayFile, "ignore me", "utf-8");

    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    const result = aggregateCosts(undefined, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
  });

  it("skips JSON primitives (non-object)", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({ type: "judge", cost: 0.001, model: "openai/gpt-4o", ts: new Date().toISOString() }),
        "42",
        '"hello"',
        "null",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("skips entries with NaN cost", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({ type: "judge", cost: 0.001, model: "openai/gpt-4o", ts: new Date().toISOString() }),
        JSON.stringify({ type: "judge", cost: NaN, model: "x", ts: new Date().toISOString() }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });

  it("populates models sorted by cost descending", () => {
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.005, "anthropic/claude", opts());
    appendCost(TEST_SESSION, TEST_CWD, "advocate-analysis", 0.002, "openai/gpt-4o", opts());

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.models).toHaveLength(2);
    // anthropic: 0.005, openai: 0.001 + 0.002 = 0.003
    expect(result.models[0].model).toBe("anthropic/claude");
    expect(result.models[0].totalCost).toBeCloseTo(0.005, 6);
    expect(result.models[1].model).toBe("openai/gpt-4o");
    expect(result.models[1].totalCost).toBeCloseTo(0.003, 6);
  });

  it("populates sessions sorted by firstTs", () => {
    writeFileSync(
      join(TEST_COSTS_DIR, "session-a.jsonl"),
      JSON.stringify({
        type: "judge",
        cost: 0.001,
        model: "x",
        ts: "2026-07-01T10:00:00.000Z",
      }) + "\n",
      "utf-8",
    );
    writeFileSync(
      join(TEST_COSTS_DIR, "session-b.jsonl"),
      JSON.stringify({
        type: "judge",
        cost: 0.002,
        model: "x",
        ts: "2026-06-01T10:00:00.000Z",
      }) + "\n",
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.sessions).toHaveLength(2);
    // session-b is older, should come first
    expect(result.sessions[0].sessionId).toBe("session-b");
    expect(result.sessions[0].totalCost).toBeCloseTo(0.002, 6);
    expect(result.sessions[1].sessionId).toBe("session-a");
    expect(result.sessions[1].totalCost).toBeCloseTo(0.001, 6);
  });

  it("populates cross-role daily summary", () => {
    writeFileSync(
      TEST_FILE,
      [
        JSON.stringify({ type: "judge", cost: 0.001, model: "x", ts: "2026-07-23T10:00:00.000Z" }),
        JSON.stringify({ type: "advocate-analysis", cost: 0.002, model: "x", ts: "2026-07-23T11:00:00.000Z" }),
        JSON.stringify({ type: "prosecutor-merge", cost: 0.003, model: "x", ts: "2026-07-24T10:00:00.000Z" }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = aggregateCosts(TEST_CWD, opts());
    expect(result.daily["2026-07-23"].totalCost).toBeCloseTo(0.003, 6);
    expect(result.daily["2026-07-23"].totalCalls).toBe(2);
    expect(result.daily["2026-07-23"].judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.daily["2026-07-24"].totalCost).toBeCloseTo(0.003, 6);
    expect(result.daily["2026-07-24"].totalCalls).toBe(1);
    expect(result.daily["2026-07-24"].prosecutor.merge.totalCost).toBeCloseTo(0.003, 6);
  });

  it("skips non-file entries in project dir when scanning all", () => {
    // Create a subdirectory inside the project dir (simulates a non-file entry)
    const subDir = join(TEST_COSTS_DIR, "subdir");
    mkdirSync(subDir, { recursive: true });
    appendCost(TEST_SESSION, TEST_CWD, "judge", 0.001, "openai/gpt-4o", opts());

    const result = aggregateCosts(undefined, opts());
    expect(result.judge.totalCost).toBeCloseTo(0.001, 6);
    expect(result.judge.calls).toBe(1);
  });
});
