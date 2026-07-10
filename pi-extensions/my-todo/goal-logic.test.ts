import { describe, it, expect } from "vitest";
import type { ActiveGoal } from "./types";
import {
  buildGoalSystemPrompt,
  buildGoalPrompt,
  buildObjectiveUpdatedPrompt,
  buildResumePrompt,
  buildContinuePrompt,
  continuationMarker,
  extractContinuationMarker,
  extractGoalTextFromSystemPrompt,
  formatStatus,
  formatDuration,
  formatTokenCount,
  formatBudget,
  goalSummary,
  goalCommandHint,
  MAX_CONTINUATIONS,
  CONTINUATION_MARKER_PREFIX,
} from "./goal-logic";

const sampleGoal: ActiveGoal = {
  id: "goal-123",
  text: "Refactor authentication",
  status: "active",
  startedAt: 1000,
  updatedAt: 2000,
  iteration: 3,
  tokensUsed: 1500,
  timeUsedSeconds: 45,
};

describe("goal constants", () => {
  it("exports MAX_CONTINUATIONS", () => {
    expect(MAX_CONTINUATIONS).toBe(50);
  });

  it("exports CONTINUATION_MARKER_PREFIX", () => {
    expect(CONTINUATION_MARKER_PREFIX).toBe("pi-goal-continuation:");
  });
});

describe("buildGoalSystemPrompt", () => {
  it("includes goal objective block and persistence rules", () => {
    const prompt = buildGoalSystemPrompt(sampleGoal);
    expect(prompt).toContain("Active /goal:");
    expect(prompt).toContain(sampleGoal.text);
    expect(prompt).toContain("Goal-mode rules:");
    expect(prompt).toContain("Keep going until the active goal is completely resolved end-to-end.");
  });
});

describe("buildGoalPrompt", () => {
  it("includes goal mode activation and objective", () => {
    const prompt = buildGoalPrompt(sampleGoal);
    expect(prompt).toContain("Goal mode is active.");
    expect(prompt).toContain(sampleGoal.text);
    expect(prompt).toContain("Keep going until this goal is completely resolved end-to-end.");
  });
});

describe("buildObjectiveUpdatedPrompt", () => {
  it("includes updated objective and persistence rules", () => {
    const prompt = buildObjectiveUpdatedPrompt(sampleGoal);
    expect(prompt).toContain("The active /goal objective was updated.");
    expect(prompt).toContain(sampleGoal.text);
    expect(prompt).toContain("Keep going until the updated goal is completely resolved end-to-end.");
  });
});

describe("buildResumePrompt", () => {
  it("includes resume notice and persistence rules", () => {
    const prompt = buildResumePrompt(sampleGoal);
    expect(prompt).toContain("The user explicitly resumed the paused /goal.");
    expect(prompt).toContain(sampleGoal.text);
    expect(prompt).toContain("Keep going until this goal is completely resolved end-to-end.");
  });
});

describe("buildContinuePrompt", () => {
  it("includes iteration, marker comment, and persistence rules", () => {
    const marker = continuationMarker(sampleGoal);
    const prompt = buildContinuePrompt(sampleGoal, marker);
    expect(prompt).toContain("Continue the active /goal until it is complete:");
    expect(prompt).toContain(`automatic continuation #${sampleGoal.iteration}`);
    expect(prompt).toContain(sampleGoal.text);
    expect(prompt).toContain(`<!-- ${CONTINUATION_MARKER_PREFIX}${marker} -->`);
  });
});

describe("continuationMarker", () => {
  it("returns id:iteration", () => {
    expect(continuationMarker(sampleGoal)).toBe("goal-123:3");
  });
});

describe("extractContinuationMarker", () => {
  it("extracts marker from prompt comment", () => {
    const prompt = `Some prompt text\n<!-- ${CONTINUATION_MARKER_PREFIX}goal-123:3 -->`;
    expect(extractContinuationMarker(prompt)).toBe("goal-123:3");
  });

  it("returns undefined when marker is absent", () => {
    expect(extractContinuationMarker("No marker here")).toBeUndefined();
  });
});

describe("formatStatus", () => {
  it("returns undefined for undefined goal", () => {
    expect(formatStatus(undefined)).toBeUndefined();
  });

  it("returns complete for complete status", () => {
    expect(formatStatus({ ...sampleGoal, status: "complete" })).toBe("complete");
  });

  it("returns paused for paused status", () => {
    expect(formatStatus({ ...sampleGoal, status: "paused" })).toBe("paused");
  });

  it("returns active duration for active status", () => {
    expect(formatStatus({ ...sampleGoal, status: "active", timeUsedSeconds: 45 })).toBe("active 45s");
  });
});

describe("formatDuration", () => {
  it("returns seconds when under a minute", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("returns minutes when under an hour", () => {
    expect(formatDuration(120)).toBe("2m");
  });

  it("returns hours and minutes when an hour or more", () => {
    expect(formatDuration(3660)).toBe("1h1m");
  });
});

describe("formatTokenCount", () => {
  it("returns raw value under 1000", () => {
    expect(formatTokenCount(999)).toBe("999");
  });

  it("returns integer kilos for exact thousands", () => {
    expect(formatTokenCount(2000)).toBe("2k");
  });

  it("returns decimal kilos for non-integer thousands", () => {
    expect(formatTokenCount(1234)).toBe("1.2k");
    expect(formatTokenCount(1500)).toBe("1.5k");
  });

  it("returns integer megas for exact millions", () => {
    expect(formatTokenCount(2000000)).toBe("2m");
  });

  it("returns decimal megas for non-integer millions", () => {
    expect(formatTokenCount(1234567)).toBe("1.2m");
  });
});

describe("formatBudget", () => {
  it("returns used over zero budget", () => {
    const budget = formatBudget(sampleGoal);
    expect(budget).toBe("1.5k/0");
  });
});

describe("goalSummary", () => {
  it("returns a multi-line summary", () => {
    const summary = goalSummary(sampleGoal);
    expect(summary).toContain("Goal: Refactor authentication");
    expect(summary).toContain("Status: active");
    expect(summary).toContain("Iteration: 3");
    expect(summary).toContain("Elapsed: 45s");
    expect(summary).toContain("Commands: /goal edit <objective>, /goal pause, /goal clear");
  });
});

describe("goalCommandHint", () => {
  it("returns active hints", () => {
    expect(goalCommandHint("active")).toBe("/goal edit <objective>, /goal pause, /goal clear");
  });

  it("returns paused hints", () => {
    expect(goalCommandHint("paused")).toBe("/goal edit <objective>, /goal resume, /goal clear");
  });

  it("returns complete hints", () => {
    expect(goalCommandHint("complete")).toBe("/goal edit <objective>, /goal clear");
  });
});

describe("extractGoalTextFromSystemPrompt", () => {
  it("extracts goal text from my-todo system prompt", () => {
    const prompt = buildGoalSystemPrompt(sampleGoal);
    expect(extractGoalTextFromSystemPrompt(prompt)).toBe(sampleGoal.text);
  });

  it("extracts goal text from a larger system prompt", () => {
    const prompt = `You are a helpful assistant.\n\n${buildGoalSystemPrompt(sampleGoal)}\n\nProceed.`;
    expect(extractGoalTextFromSystemPrompt(prompt)).toBe(sampleGoal.text);
  });

  it("returns undefined when no active goal section exists", () => {
    expect(extractGoalTextFromSystemPrompt("No goal here.")).toBeUndefined();
  });

  it("returns undefined when goal section has no rules suffix", () => {
    expect(extractGoalTextFromSystemPrompt("Active /goal:\n\nOnly this")).toBeUndefined();
  });

  it("trims surrounding whitespace from extracted goal", () => {
    const prompt = "Active /goal:\n\n  Verify all docs  \n\nGoal-mode rules:\n...";
    expect(extractGoalTextFromSystemPrompt(prompt)).toBe("Verify all docs");
  });

  it("returns undefined for empty goal text", () => {
    const prompt = "Active /goal:\n\n\n\nGoal-mode rules:\n...";
    expect(extractGoalTextFromSystemPrompt(prompt)).toBeUndefined();
  });
});
