import type { Category, GameState, HistoryEntry } from "./types";

export interface GameStore {
  get(sessionId: string): GameState | undefined;
  set(sessionId: string, state: GameState): void;
  delete(sessionId: string): boolean;
  has(sessionId: string): boolean;
  clear(): void;
}

export function createGameStore(): GameStore {
  const map = new Map<string, GameState>();

  return {
    get(sessionId: string): GameState | undefined {
      return map.get(sessionId);
    },
    set(sessionId: string, state: GameState): void {
      map.set(sessionId, state);
    },
    delete(sessionId: string): boolean {
      return map.delete(sessionId);
    },
    has(sessionId: string): boolean {
      return map.has(sessionId);
    },
    clear(): void {
      map.clear();
    },
  };
}

export function createGameState(
  sessionId: string,
  target: string,
  summary: string,
  category: Category,
): GameState {
  return {
    sessionId,
    target,
    summary,
    category,
    startedAt: Date.now(),
    history: [],
    wrongGuesses: [],
  };
}

export function recordAnswer(state: GameState, question: string, answer: "Yes" | "No" | "Unknown"): void {
  state.history.push({ question, answer });
}

export function recordWrongGuess(state: GameState, guess: string): void {
  state.wrongGuesses.push(guess);
}
