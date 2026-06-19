/**
 * Shared types for pi-pet.
 */

export interface PetState {
  name: string;
  species: string;
  stage: string;
  hunger: number;
  mood: number;
  energy: number;
  lastUpdatedAt: number;
}
