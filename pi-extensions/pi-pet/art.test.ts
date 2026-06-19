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

function includesText(frame: string[], marker: string): boolean {
  return frame.some((line) => line.includes(marker));
}

describe("selectFrame", () => {
  it("returns 3-line frame", () => {
    const frame = selectFrame(makeState());
    expect(frame.length).toBe(3);
  });

  it("returns happy frame when mood > 60 and energy > 40", () => {
    const frame = selectFrame(makeState({ mood: 80, energy: 80 }));
    expect(includesText(frame, "^w^")).toBe(true);
  });

  it("returns neutral frame for normal stats", () => {
    const frame = selectFrame(makeState({ hunger: 50, mood: 50, energy: 50 }));
    expect(includesText(frame, "-_-")).toBe(true);
  });

  it("returns hungry frame when hunger > 70", () => {
    const frame = selectFrame(makeState({ hunger: 80 }));
    expect(includesText(frame, ">_<")).toBe(true);
  });

  it("hungry overrides happy", () => {
    const frame = selectFrame(makeState({ hunger: 85, mood: 80, energy: 80 }));
    expect(includesText(frame, ">_<")).toBe(true);
  });

  it("returns sad frame when mood < 30", () => {
    const frame = selectFrame(makeState({ mood: 20 }));
    expect(includesText(frame, ";_;")).toBe(true);
  });

  it("returns tired frame when energy < 15", () => {
    const frame = selectFrame(makeState({ energy: 10 }));
    expect(includesText(frame, "-.-")).toBe(true);
  });

  it("tired overrides hungry", () => {
    const frame = selectFrame(makeState({ energy: 10, hunger: 90 }));
    expect(includesText(frame, "-.-")).toBe(true);
  });
});

describe("renderStatus", () => {
  it("includes the pet name and stage", () => {
    const lines = renderStatus(makeState());
    expect(lines[0]).toContain("Mochi");
    expect(lines[0]).toContain("baby");
  });

  it("has hunger, mood, and energy bars", () => {
    const text = renderStatus(makeState()).join("\n");
    expect(text).toContain("Hunger");
    expect(text).toContain("Mood");
    expect(text).toContain("Energy");
  });

  it("uses wider bars on large screens", () => {
    const narrow = renderStatus(makeState(), 30).filter((l) => l.includes("█"));
    const wide = renderStatus(makeState(), 60).filter((l) => l.includes("█"));
    expect(wide.some((l) => l.length > narrow[0].length)).toBe(true);
  });
});
