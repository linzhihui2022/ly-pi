/**
 * Pet state management with decay and persistence.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { PetState } from "./types";

const MS_PER_HOUR = 60 * 60 * 1000;

export interface PetStateManagerOptions {
  path?: string;
  now?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class PetStateManager {
  private path: string;
  private state: PetState;
  private now: () => number;

  constructor(options?: PetStateManagerOptions) {
    this.path = options?.path ?? join(homedir(), ".pi", "pet-state.json");
    this.now = options?.now ?? Date.now;
    this.state = this.load();
  }

  getState(): PetState {
    return { ...this.state };
  }

  feed(): void {
    this.applyImpacts({ hunger: -30, mood: 0, energy: -2 });
  }

  play(): void {
    this.applyImpacts({ hunger: 5, mood: 20, energy: -10 });
  }

  sleep(): void {
    this.applyImpacts({ hunger: 5, mood: 0, energy: 40 });
  }

  private applyImpacts(impacts: {
    hunger: number;
    mood: number;
    energy: number;
  }): void {
    this.state.hunger = clamp(this.state.hunger + impacts.hunger, 0, 100);
    this.state.mood = clamp(this.state.mood + impacts.mood, 0, 100);
    this.state.energy = clamp(this.state.energy + impacts.energy, 0, 100);
    this.state.lastUpdatedAt = this.now();
    this.save();
  }

  private load(): PetState {
    if (!existsSync(this.path)) {
      const state = this.createDefaultState();
      this.save(state);
      return state;
    }

    const raw = readFileSync(this.path, "utf8");
    const loaded = JSON.parse(raw) as PetState;
    const elapsedHours = (this.now() - loaded.lastUpdatedAt) / MS_PER_HOUR;
    const state: PetState = {
      ...loaded,
      hunger: clamp(loaded.hunger + 2 * elapsedHours, 0, 100),
      mood: clamp(loaded.mood - 1 * elapsedHours, 0, 100),
      energy: clamp(loaded.energy - 1.5 * elapsedHours, 0, 100),
      lastUpdatedAt: this.now(),
    };
    this.save(state);
    return state;
  }

  private createDefaultState(): PetState {
    return {
      name: "Mochi",
      species: "cat",
      stage: "baby",
      hunger: 80,
      mood: 80,
      energy: 80,
      lastUpdatedAt: this.now(),
    };
  }

  private save(state: PetState = this.state): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, this.path);
  }
}
