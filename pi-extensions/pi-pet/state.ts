/**
 * Pet state management with decay and persistence.
 */

import fs from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import type { PetEventImpact, PetState } from "./types";

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
    this.path = options?.path ?? join(os.homedir(), ".pi", "pet-state.json");
    this.now = options?.now ?? Date.now;
    this.state = this.load();
  }

  getState(): PetState {
    return { ...this.state };
  }

  getPath(): string {
    return this.path;
  }

  feed(amount = 30): void {
    this.applyImpacts({ hunger: -amount, energy: -2 });
  }

  play(amount = 20): void {
    this.applyImpacts({ mood: amount, energy: -10, hunger: 5 });
  }

  sleep(amount = 40): void {
    this.applyImpacts({ energy: amount, hunger: 5 });
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (trimmed === "") return;
    this.state.name = trimmed;
    this.state.lastUpdatedAt = this.now();
    this.save();
  }

  applyEventImpacts(impacts: PetEventImpact): void {
    this.applyImpacts(impacts);
  }

  private applyImpacts(impacts: PetEventImpact): void {
    this.state.hunger = clamp(
      this.state.hunger + (impacts.hunger ?? 0),
      0,
      100,
    );
    this.state.mood = clamp(this.state.mood + (impacts.mood ?? 0), 0, 100);
    this.state.energy = clamp(
      this.state.energy + (impacts.energy ?? 0),
      0,
      100,
    );
    this.state.lastUpdatedAt = this.now();
    this.save();
  }

  private load(): PetState {
    if (!fs.existsSync(this.path)) {
      const state = this.createDefaultState();
      this.save(state);
      return state;
    }

    const raw = fs.readFileSync(this.path, "utf8");
    const loaded = JSON.parse(raw) as PetState;
    const elapsedHours = (this.now() - loaded.lastUpdatedAt) / MS_PER_HOUR;
    const state: PetState = {
      ...loaded,
      hunger: clamp(loaded.hunger + 2 * elapsedHours, 0, 100),
      mood: clamp(loaded.mood - 1 * elapsedHours, 0, 100),
      energy: clamp(loaded.energy - 1.5 * elapsedHours, 0, 100),
      lastUpdatedAt: this.now(),
      bornAt: loaded.bornAt ?? new Date(this.now()).toISOString(),
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
      bornAt: new Date(this.now()).toISOString(),
    };
  }

  private save(state: PetState = this.state): void {
    fs.mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, this.path);
  }
}
