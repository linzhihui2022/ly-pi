import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { PetStateManager } from "./state";

const TEST_DIR = join(os.tmpdir(), "pi-pet-test");

beforeEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

function createClock(
  initialTime = 1_000_000,
): { now: () => number; advance: (ms: number) => void } {
  let t = initialTime;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const iso = (timestamp: number): string => new Date(timestamp).toISOString();

describe("PetStateManager", () => {
  it("creates default state when file is missing", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "missing.json");

    const manager = new PetStateManager({ path, now: clock.now });

    expect(manager.getState()).toEqual({
      name: "Mochi",
      species: "cat",
      stage: "baby",
      hunger: 80,
      mood: 80,
      energy: 80,
      lastUpdatedAt: clock.now(),
      bornAt: iso(clock.now()),
    });
  });

  it("uses default path in home directory", () => {
    const homedirSpy = vi
      .spyOn(os, "homedir")
      .mockReturnValue(TEST_DIR);
    try {
      const clock = createClock();
      const manager = new PetStateManager({ now: clock.now });

      expect(manager.getPath()).toBe(join(TEST_DIR, ".pi", "pet-state.json"));
      expect(fs.existsSync(join(TEST_DIR, ".pi", "pet-state.json"))).toBe(true);
      expect(manager.getState().name).toBe("Mochi");
    } finally {
      homedirSpy.mockRestore();
    }
  });

  it("uses real time by default", () => {
    const before = Date.now();
    const path = join(TEST_DIR, "realtime.json");

    const manager = new PetStateManager({ path });

    const after = Date.now();
    expect(manager.getState().lastUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(manager.getState().lastUpdatedAt).toBeLessThanOrEqual(after);
  });

  it("applies decay over elapsed time", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "decay.json");

    new PetStateManager({ path, now: clock.now });
    clock.advance(60 * 60 * 1000);
    const manager = new PetStateManager({ path, now: clock.now });

    expect(manager.getState()).toEqual({
      name: "Mochi",
      species: "cat",
      stage: "baby",
      hunger: 82,
      mood: 79,
      energy: 78.5,
      lastUpdatedAt: clock.now(),
      bornAt: iso(1_000_000),
    });
  });

  it("clamps decayed values to [0, 100]", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "clamp.json");

    new PetStateManager({ path, now: clock.now });
    clock.advance(100 * 60 * 60 * 1000);
    const manager = new PetStateManager({ path, now: clock.now });

    const state = manager.getState();
    expect(state.hunger).toBe(100);
    expect(state.mood).toBe(0);
    expect(state.energy).toBe(0);
  });

  it("applies feed effects", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "feed.json");

    const manager = new PetStateManager({ path, now: clock.now });
    manager.feed();

    const state = manager.getState();
    expect(state.hunger).toBe(50);
    expect(state.energy).toBe(78);
    expect(state.mood).toBe(80);
  });

  it("applies play effects", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "play.json");

    const manager = new PetStateManager({ path, now: clock.now });
    manager.play();

    const state = manager.getState();
    expect(state.mood).toBe(100);
    expect(state.energy).toBe(70);
    expect(state.hunger).toBe(85);
  });

  it("applies sleep effects", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "sleep.json");

    const manager = new PetStateManager({ path, now: clock.now });
    manager.sleep();

    const state = manager.getState();
    expect(state.energy).toBe(100);
    expect(state.hunger).toBe(85);
    expect(state.mood).toBe(80);
  });

  it("clamps action impacts to [0, 100]", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "clamp-action.json");

    const manager = new PetStateManager({ path, now: clock.now });
    manager.feed();
    manager.feed();
    manager.feed();

    const state = manager.getState();
    expect(state.hunger).toBe(0);
    expect(state.energy).toBe(74);
  });

  it("persists state across manager instances", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "roundtrip.json");

    const manager = new PetStateManager({ path, now: clock.now });
    manager.feed();

    clock.advance(30 * 60 * 1000);
    const reloaded = new PetStateManager({ path, now: clock.now });

    const state = reloaded.getState();
    expect(state.hunger).toBe(51);
    expect(state.energy).toBe(77.25);
    expect(state.mood).toBe(79.5);
    expect(state.lastUpdatedAt).toBe(clock.now());
    expect(state.bornAt).toBe(iso(1_000_000));
  });

  it("fills in missing bornAt when loading existing state", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "missing-bornat.json");

    fs.writeFileSync(
      path,
      JSON.stringify({
        name: "Mochi",
        species: "cat",
        stage: "baby",
        hunger: 50,
        mood: 50,
        energy: 50,
        lastUpdatedAt: clock.now(),
      }),
    );

    const manager = new PetStateManager({ path, now: clock.now });

    expect(manager.getState().bornAt).toBe(iso(clock.now()));
  });

  it("treats omitted impact fields as zero", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "partial-impacts.json");

    const manager = new PetStateManager({ path, now: clock.now });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager as any).applyImpacts({ mood: 10 });

    const state = manager.getState();
    expect(state.hunger).toBe(80);
    expect(state.energy).toBe(80);
    expect(state.mood).toBe(90);
  });

  it("saves atomically via a temp file and rename", () => {
    const clock = createClock();
    const path = join(TEST_DIR, "atomic.json");

    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    const renameSpy = vi
      .spyOn(fs, "renameSync")
      .mockImplementation(() => undefined);

    try {
      const manager = new PetStateManager({ path, now: clock.now });
      manager.feed();

      expect(writeSpy).toHaveBeenCalled();
      const lastWritePath = writeSpy.mock.calls.at(-1)?.[0];
      expect(lastWritePath).toBe(`${path}.tmp`);

      expect(renameSpy).toHaveBeenCalledWith(`${path}.tmp`, path);
    } finally {
      writeSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });

  it("rename updates pet name and persists", () => {
    const path = join(TEST_DIR, "rename.json");
    const manager = new PetStateManager({ path });
    manager.rename("Luna");
    expect(manager.getState().name).toBe("Luna");

    const reloaded = new PetStateManager({ path });
    expect(reloaded.getState().name).toBe("Luna");
  });

  it("rename ignores empty strings", () => {
    const path = join(TEST_DIR, "no-rename.json");
    const manager = new PetStateManager({ path });
    manager.rename("  ");
    expect(manager.getState().name).toBe("Mochi");
  });

  it("applyEventImpacts applies impacts and saves", () => {
    const path = join(TEST_DIR, "event.json");
    const manager = new PetStateManager({ path });
    manager.applyEventImpacts({ mood: 5, hunger: -3 });
    const state = manager.getState();
    expect(state.mood).toBe(85);
    expect(state.hunger).toBe(77);

    const reloaded = new PetStateManager({ path });
    expect(reloaded.getState().mood).toBe(85);
  });
});
