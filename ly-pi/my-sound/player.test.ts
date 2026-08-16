import { beforeEach, describe, expect, it, vi } from "vitest";
import * as coordinator from "./coordinator";
import {
  listCategories,
  pickSoundFile,
  playCategory,
  playSound,
  resolveSoundPath,
} from "./player";
import type { SoundPack } from "./types";

let nextPid = 1000;

vi.mock("./coordinator", () => ({
  spawnSoundProcess: vi.fn((filePath: string) => ({
    pid: nextPid++,
    cmd: `afplay "${filePath}"`,
  })),
}));

const mockPack: SoundPack = {
  soundDir: "/fake/sounds",
  categories: {
    startup: {
      description: "Startup",
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
};

const soundDir = "/fake/sounds";

beforeEach(() => {
  vi.mocked(coordinator.spawnSoundProcess).mockClear();
});

describe("playCategory", () => {
  it("plays a sound from the category", () => {
    playCategory(mockPack, soundDir, "startup");
    expect(coordinator.spawnSoundProcess).toHaveBeenCalledOnce();
    expect(coordinator.spawnSoundProcess).toHaveBeenCalledWith(
      "/fake/sounds/startup.mp3",
    );
  });

  it("does nothing for unknown category", () => {
    playCategory(mockPack, soundDir, "nonexistent");
    expect(coordinator.spawnSoundProcess).not.toHaveBeenCalled();
  });
});

describe("playSound", () => {
  it("spawns sound process", () => {
    playSound("/fake/sounds/custom.mp3");
    expect(coordinator.spawnSoundProcess).toHaveBeenCalledWith(
      "/fake/sounds/custom.mp3",
    );
  });
});

describe("listCategories", () => {
  it("returns all category names and descriptions", () => {
    const result = listCategories(mockPack);
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      name: "startup",
      description: "Startup",
    });
    expect(result[1]).toEqual({
      name: "affirmative",
      description: "Affirmative response",
    });
  });
});

describe("pickSoundFile", () => {
  it("returns the only file when single file exists", () => {
    const result = pickSoundFile(mockPack, "startup");
    expect(result).toBe("startup.mp3");
  });

  it("returns one of the files when multiple exist", () => {
    // Run multiple times to verify it's deterministic (not random)
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const file = pickSoundFile(mockPack, "affirmative");
      expect(file).toBeDefined();
      if (file) results.add(file);
    }
    // With 2 files, both should appear over 20 runs
    expect(results.has("affirm_1.mp3")).toBe(true);
    expect(results.has("affirm_2.mp3")).toBe(true);
  });

  it("returns undefined for unknown category", () => {
    const result = pickSoundFile(mockPack, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined when the category has no files", () => {
    const emptyPack: SoundPack = {
      soundDir: "/fake/sounds",
      categories: {
        startup: { description: "Startup", files: [] },
      },
    };
    const result = pickSoundFile(emptyPack, "startup");
    expect(result).toBeUndefined();
  });
});

describe("resolveSoundPath", () => {
  it("resolves a file relative to soundDir", () => {
    const result = resolveSoundPath("/fake/sounds", "startup.mp3");
    expect(result).toBe("/fake/sounds/startup.mp3");
  });
});
