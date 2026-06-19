import { describe, it, expect } from "vitest";
import { selectFrame, renderStatus } from "./art";
import type { PetState } from "./types";

function makeState(overrides: Partial<PetState> = {}): PetState {
  return {
    name: "Mochi",
    species: "cat",
    stage: "baby",
    bornAt: "2025-01-01T00:00:00.000Z",
    lastUpdatedAt: Date.now(),
    hunger: 50,
    mood: 50,
    energy: 50,
    ...overrides,
  };
}

function includesFrame(frame: string[], marker: string): boolean {
  return frame.some((line) => line.includes(marker));
}

describe("selectFrame", () => {
  it("returns happy frame when mood > 60 and energy > 40", () => {
    const frame = selectFrame(makeState({ mood: 80, energy: 80 }));
    expect(includesFrame(frame, "o.o")).toBe(true);
  });

  it("returns hungry frame when hunger > 70 (overrides neutral)", () => {
    const frame = selectFrame(makeState({ hunger: 80, mood: 50, energy: 50 }));
    expect(includesFrame(frame, "> <")).toBe(true);
  });

  it("returns tired frame when energy < 30 (overrides hungry if energy is very low)", () => {
    const frame = selectFrame(makeState({ energy: 10, hunger: 80 }));
    expect(includesFrame(frame, "-.-")).toBe(true);
  });

  it("returns sad frame when mood < 30", () => {
    const frame = selectFrame(makeState({ mood: 20, energy: 60 }));
    expect(includesFrame(frame, ";.;")).toBe(true);
  });

  it("returns neutral frame for normal stats", () => {
    const frame = selectFrame(makeState({ hunger: 50, mood: 50, energy: 50 }));
    expect(includesFrame(frame, "^_^")).toBe(true);
  });

  it("hungry overrides neutral/slightly-happy", () => {
    const frame = selectFrame(makeState({ hunger: 85, mood: 80, energy: 80 }));
    expect(includesFrame(frame, "> <")).toBe(true);
  });

  it("tired overrides hungry if energy is severely low (< 15)", () => {
    const frame = selectFrame(makeState({ energy: 10, hunger: 90, mood: 50 }));
    expect(includesFrame(frame, "-.-")).toBe(true);
  });
});

describe("renderStatus", () => {
  it("returns status lines with bar indicators (narrow)", () => {
    const lines = renderStatus(makeState({ hunger: 40, mood: 80, energy: 60 }), 30);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some((l) => l.includes("Hunger"))).toBe(true);
    expect(lines.some((l) => l.includes("Mood"))).toBe(true);
    expect(lines.some((l) => l.includes("Energy"))).toBe(true);
  });

  it("uses wider bars on large screens", () => {
    const lines = renderStatus(makeState({ hunger: 40, mood: 80, energy: 60 }), 60);
    expect(lines.some((l) => l.includes("Hunger"))).toBe(true);
  });
});
