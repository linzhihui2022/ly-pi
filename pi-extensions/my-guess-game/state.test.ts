import { describe, it, expect, beforeEach } from "vitest";
import { createGameStore, createGameState, recordAnswer, recordWrongGuess } from "./state";

describe("createGameStore", () => {
  let store: ReturnType<typeof createGameStore>;

  beforeEach(() => {
    store = createGameStore();
  });

  it("returns undefined for missing session", () => {
    expect(store.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a game", () => {
    const state = createGameState("s1", "Alice", "Test subject", "any");
    store.set("s1", state);
    expect(store.get("s1")).toBe(state);
  });

  it("checks existence", () => {
    expect(store.has("s1")).toBe(false);
    store.set("s1", createGameState("s1", "Alice", "Test subject", "any"));
    expect(store.has("s1")).toBe(true);
  });

  it("deletes a game", () => {
    store.set("s1", createGameState("s1", "Alice", "Test subject", "any"));
    expect(store.delete("s1")).toBe(true);
    expect(store.get("s1")).toBeUndefined();
  });

  it("delete returns false when missing", () => {
    expect(store.delete("missing")).toBe(false);
  });

  it("clears all games", () => {
    store.set("s1", createGameState("s1", "Alice", "Test subject", "any"));
    store.set("s2", createGameState("s2", "Bob", "Test subject", "any"));
    store.clear();
    expect(store.has("s1")).toBe(false);
    expect(store.has("s2")).toBe(false);
  });

  it("isolates sessions", () => {
    store.set("s1", createGameState("s1", "Alice", "Test subject", "any"));
    expect(store.get("s2")).toBeUndefined();
  });
});

describe("createGameState", () => {
  it("creates a game with defaults", () => {
    const state = createGameState("s1", "Alice", "A test person", "science");
    expect(state.sessionId).toBe("s1");
    expect(state.target).toBe("Alice");
    expect(state.summary).toBe("A test person");
    expect(state.category).toBe("science");
    expect(state.history).toEqual([]);
    expect(state.wrongGuesses).toEqual([]);
    expect(state.startedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("recordAnswer", () => {
  it("appends answer to history", () => {
    const state = createGameState("s1", "Alice", "Test subject", "any");
    recordAnswer(state, "Is she real?", "Yes");
    expect(state.history).toEqual([{ question: "Is she real?", answer: "Yes" }]);
  });

  it("preserves order", () => {
    const state = createGameState("s1", "Alice", "Test subject", "any");
    recordAnswer(state, "Q1", "Yes");
    recordAnswer(state, "Q2", "No");
    recordAnswer(state, "Q3", "Unknown");
    expect(state.history).toEqual([
      { question: "Q1", answer: "Yes" },
      { question: "Q2", answer: "No" },
      { question: "Q3", answer: "Unknown" },
    ]);
  });
});

describe("recordWrongGuess", () => {
  it("appends wrong guess", () => {
    const state = createGameState("s1", "Alice", "Test subject", "any");
    recordWrongGuess(state, "Bob");
    expect(state.wrongGuesses).toEqual(["Bob"]);
  });

  it("preserves order", () => {
    const state = createGameState("s1", "Alice", "Test subject", "any");
    recordWrongGuess(state, "Bob");
    recordWrongGuess(state, "Carol");
    expect(state.wrongGuesses).toEqual(["Bob", "Carol"]);
  });
});
