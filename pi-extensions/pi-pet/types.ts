/**
 * Shared types for pi-pet.
 */

export interface PetState {
  name: string;
  species: "cat";
  stage: "baby" | "adult";
  hunger: number;
  mood: number;
  energy: number;
  lastUpdatedAt: number;
  bornAt: string;
}

export type PetEventImpact = {
  hunger?: number;
  mood?: number;
  energy?: number;
};

export type EventMagnitude =
  | "positive-small"
  | "positive-large"
  | "negative-small"
  | "negative-large";
