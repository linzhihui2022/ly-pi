import { describe, it, expect } from "vitest";
import { listCategories, pickSoundFile, resolveSoundPath } from "./player";
import type { BtConfig } from "./types";

const mockConfig: BtConfig = {
  soundDir: "/fake/sounds",
  categories: {
    startup: {
      description: "BT-7274 startup",
      files: ["startup.mp3"],
    },
    affirmative: {
      description: "Affirmative response",
      files: ["affirm_1.mp3", "affirm_2.mp3"],
    },
    warning: {
      description: "Warning alert",
      files: ["warning.mp3"],
    },
    engaging: {
      description: "Engaging",
      files: ["engage.mp3"],
    },
    completed: {
      description: "Task completed",
      files: ["done.mp3"],
    },
    error: {
      description: "Error occurred",
      files: ["error_1.mp3", "error_2.mp3"],
    },
  },
  eventMap: {
    session_start: "startup",
    agent_start: "engaging",
    agent_end: "completed",
  },
};

describe("listCategories", () => {
  it("returns all category names and descriptions", () => {
    const result = listCategories(mockConfig);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ name: "startup", description: "BT-7274 startup" });
    expect(result[1]).toEqual({ name: "affirmative", description: "Affirmative response" });
  });
});

describe("pickSoundFile", () => {
  it("returns the only file when single file exists", () => {
    const result = pickSoundFile(mockConfig, "startup");
    expect(result).toBe("startup.mp3");
  });

  it("returns one of the files when multiple exist", () => {
    // Run multiple times to verify it's deterministic (not random)
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      results.add(pickSoundFile(mockConfig, "affirmative"));
    }
    // With 2 files, both should appear over 20 runs
    expect(results.has("affirm_1.mp3")).toBe(true);
    expect(results.has("affirm_2.mp3")).toBe(true);
  });

  it("returns undefined for unknown category", () => {
    const result = pickSoundFile(mockConfig, "nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("resolveSoundPath", () => {
  it("resolves a file relative to soundDir", () => {
    const result = resolveSoundPath(mockConfig, "startup.mp3");
    expect(result).toBe("/fake/sounds/startup.mp3");
  });
});
