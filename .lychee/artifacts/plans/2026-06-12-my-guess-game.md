# my-guess-game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi extension (`my-guess-game`) that hosts a session-based Yes/No "guess the character" game with three tools: `play_guess_game`, `ask_guess_question`, and `submit_guess`.

**Architecture:** Six focused modules — `types.ts` (schemas + types), `state.ts` (in-memory session store), `generate.ts` (LLM character generation), `answer.ts` (LLM Yes/No/Unknown answering), `judge.ts` (guess matching), `format.ts` (result envelopes), and `index.ts` (extension glue that registers the three tools). The extension uses `ctx.sessionManager.getSessionId()` for session identity and `@earendil-works/pi-ai`'s `completeSimple` for LLM calls when `ctx.model` is available.

**Tech Stack:** TypeScript, Bun, Vitest (coverage), `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`.

---

## File Structure

```
pi-extensions/my-guess-game/
├── types.ts              # TypeBox schemas + internal TypeScript types
├── state.ts              # In-memory GameState store keyed by sessionId
├── generate.ts           # LLM character generation + parsing
├── answer.ts             # LLM Yes/No/Unknown answering
├── judge.ts              # LLM guess matching judgement
├── format.ts             # Result envelope formatting
├── index.ts              # Extension factory: registers three tools
├── state.test.ts         # Unit tests for state store (100% coverage)
├── generate.test.ts      # Unit tests for character generation (100% coverage)
├── answer.test.ts        # Unit tests for answer parsing (100% coverage)
├── judge.test.ts         # Unit tests for guess judgement (100% coverage)
├── format.test.ts        # Unit tests for format helpers (100% coverage)
├── index.test.ts         # Integration tests for tool registration
├── package.json          # Bun workspace package
├── tsconfig.json         # TypeScript config
├── vitest.config.ts      # Coverage exclusion: types.ts, index.ts
├── my-guess-game.json    # Pi extension manifest (empty {})
└── scripts/
    └── deploy.ts         # Copy dist/index.js + manifest to ~/.pi/agent/extensions/my-guess-game/
```

---

## Task 1: Scaffold Project

**Files:**
- Create: `pi-extensions/my-guess-game/package.json`
- Create: `pi-extensions/my-guess-game/tsconfig.json`
- Create: `pi-extensions/my-guess-game/vitest.config.ts`
- Create: `pi-extensions/my-guess-game/my-guess-game.json`
- Create: `pi-extensions/my-guess-game/scripts/deploy.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "my-guess-game",
  "module": "index.ts",
  "type": "module",
  "scripts": {
    "build": "bun build ./index.ts --outdir dist --target node --format esm --external '@earendil-works/*'",
    "test": "npx vitest run --coverage",
    "deploy": "bun run scripts/deploy.ts"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "vitest": "^4"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-ai": "^0.78.0",
    "@types/node": "^25.9.1",
    "typebox": "^1.1.39"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2016",
    "module": "commonjs",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "types": []
  }
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["types.ts", "index.ts", "scripts/**"],
    },
  },
});
```

- [ ] **Step 4: Create my-guess-game.json**

```json
{}
```

- [ ] **Step 5: Create scripts/deploy.ts**

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".pi/agent/extensions/my-guess-game");
await mkdir(dest, { recursive: true });
await Bun.write(join(dest, "index.js"), Bun.file("dist/index.js"));
await Bun.write(join(dest, "my-guess-game.json"), Bun.file("my-guess-game.json"));
```

- [ ] **Step 6: Install dependencies**

Run: `cd pi-extensions/my-guess-game && bun install --registry https://registry.npmmirror.com`

Expected: Dependencies installed, `node_modules/` created.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/
git commit -m "chore(my-guess-game): scaffold extension project"
```

---

## Task 2: types.ts (Schemas and Types)

**Files:**
- Create: `pi-extensions/my-guess-game/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
import { Type, type Static } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

export const CATEGORIES = ["any", "science", "sports", "history", "arts", "fictional"] as const;

export const CategorySchema = StringEnum(CATEGORIES, {
  default: "any",
  description: "Optional category hint for the secret character.",
});

export const PlayGuessGameParamsSchema = Type.Object({
  category: Type.Optional(CategorySchema),
});

export const AskGuessQuestionParamsSchema = Type.Object({
  question: Type.String({ minLength: 1, description: "A Yes/No question about the secret character." }),
});

export const SubmitGuessParamsSchema = Type.Object({
  guess: Type.String({ minLength: 1, description: "The name of the character you are guessing." }),
});

export type PlayGuessGameParams = Static<typeof PlayGuessGameParamsSchema>;
export type AskGuessQuestionParams = Static<typeof AskGuessQuestionParamsSchema>;
export type SubmitGuessParams = Static<typeof SubmitGuessParamsSchema>;
export type Category = Static<typeof CategorySchema>;

export type YesNoUnknown = "Yes" | "No" | "Unknown";

export interface HistoryEntry {
  question: string;
  answer: YesNoUnknown;
}

export interface GameState {
  sessionId: string;
  target: string;
  summary: string;
  category: Category;
  startedAt: number;
  history: HistoryEntry[];
  wrongGuesses: string[];
}

export type GuessGameError =
  | "no_llm"
  | "generation_failed"
  | "game_already_active"
  | "no_active_game"
  | "invalid_answer"
  | "ambiguous_guess";

export interface GeneratedCharacter {
  target: string;
  summary: string;
}

export interface PlayGuessGameResultDetails {
  target: string;
  summary: string;
  category: Category;
  sessionId: string;
}

export interface AskGuessQuestionResultDetails {
  question: string;
  answer: YesNoUnknown;
  questionCount: number;
}

export interface SubmitGuessResultDetails {
  guess: string;
  correct: boolean;
  target?: string;
  summary?: string;
  history: HistoryEntry[];
  wrongGuesses: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add pi-extensions/my-guess-game/types.ts
git commit -m "feat(my-guess-game): add schemas and types"
```

---

## Task 3: state.ts (In-Memory Store) (TDD)

**Files:**
- Create: `pi-extensions/my-guess-game/state.ts`
- Create: `pi-extensions/my-guess-game/state.test.ts`

- [ ] **Step 1: Write state.ts skeleton**

```typescript
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
  throw new Error("not implemented");
}

export function recordAnswer(state: GameState, question: string, answer: "Yes" | "No" | "Unknown"): void {
  throw new Error("not implemented");
}

export function recordWrongGuess(state: GameState, guess: string): void {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write state.test.ts**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createGameStore, createGameState, recordAnswer, recordWrongGuess } from "./state";
import type { GameState } from "./types";

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
```

- [ ] **Step 3: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run state.test.ts`

Expected: FAIL — "not implemented" errors.

- [ ] **Step 4: Implement state.ts**

Replace the three throwing functions with:

```typescript
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
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run state.test.ts`

Expected: PASS — all tests pass.

- [ ] **Step 6: Check coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage state.test.ts`

Expected: Coverage report shows 100% for state.ts.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/state.ts pi-extensions/my-guess-game/state.test.ts
git commit -m "feat(my-guess-game): implement in-memory game store with full test coverage"
```

---

## Task 4: format.ts (Result Envelopes) (TDD)

**Files:**
- Create: `pi-extensions/my-guess-game/format.ts`
- Create: `pi-extensions/my-guess-game/format.test.ts`

- [ ] **Step 1: Write format.ts skeleton**

```typescript
import type { Category, GameState, GuessGameError, HistoryEntry, SubmitGuessResultDetails } from "./types";

export function buildToolResult(text: string, details: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true as const } : {}),
  };
}

export function formatGenerationPrompt(category: Category): string {
  throw new Error("not implemented");
}

export function formatRefereePrompt(target: string, summary: string, sessionId: string): string {
  throw new Error("not implemented");
}

export function formatAnswerPrompt(target: string, summary: string, question: string): string {
  throw new Error("not implemented");
}

export function formatJudgementPrompt(target: string, summary: string, guess: string): string {
  throw new Error("not implemented");
}

export function formatReplay(history: HistoryEntry[]): string {
  throw new Error("not implemented");
}

export function parseCharacter(text: string): { target: string; summary: string } | undefined {
  throw new Error("not implemented");
}

export function normalizeYesNoUnknown(text: string): "Yes" | "No" | "Unknown" | undefined {
  throw new Error("not implemented");
}

export function normalizeJudgement(text: string): "correct" | "incorrect" | undefined {
  throw new Error("not implemented");
}

export function buildErrorResult(error: GuessGameError, message: string) {
  throw new Error("not implemented");
}

export function buildSubmitSuccessResult(state: GameState, guess: string) {
  throw new Error("not implemented");
}

export function buildSubmitFailureResult(state: GameState, guess: string) {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write format.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import {
  buildToolResult,
  formatGenerationPrompt,
  formatRefereePrompt,
  formatAnswerPrompt,
  formatJudgementPrompt,
  formatReplay,
  parseCharacter,
  normalizeYesNoUnknown,
  normalizeJudgement,
  buildErrorResult,
  buildSubmitSuccessResult,
  buildSubmitFailureResult,
} from "./format";
import { createGameState, recordAnswer, recordWrongGuess } from "./state";

describe("buildToolResult", () => {
  it("builds a normal result", () => {
    const result = buildToolResult("hello", { foo: 1 });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.details).toEqual({ foo: 1 });
    expect(result.isError).toBeUndefined();
  });

  it("builds an error result", () => {
    const result = buildToolResult("error", { foo: 1 }, true);
    expect(result.isError).toBe(true);
  });
});

describe("formatGenerationPrompt", () => {
  it("includes category hint for non-any", () => {
    const prompt = formatGenerationPrompt("science");
    expect(prompt).toContain("科学");
    expect(prompt).toContain("名字：");
    expect(prompt).toContain("简介：");
  });

  it("omits category hint for any", () => {
    const prompt = formatGenerationPrompt("any");
    expect(prompt).not.toContain("请选择与");
  });
});

describe("formatRefereePrompt", () => {
  it("includes target, summary, rules, and session id", () => {
    const prompt = formatRefereePrompt("Alice", "A scientist", "session-1");
    expect(prompt).toContain("【秘密人物】Alice");
    expect(prompt).toContain("【简介】A scientist");
    expect(prompt).toContain("ask_guess_question");
    expect(prompt).toContain("submit_guess");
    expect(prompt).toContain("session-1");
  });
});

describe("formatAnswerPrompt", () => {
  it("includes target, summary, and question", () => {
    const prompt = formatAnswerPrompt("Alice", "A scientist", "Is she real?");
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("Is she real?");
    expect(prompt).toContain("Yes / No / Unknown");
  });
});

describe("formatJudgementPrompt", () => {
  it("includes target, summary, and guess", () => {
    const prompt = formatJudgementPrompt("Alice", "A scientist", "Bob");
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("用户猜测：Bob");
    expect(prompt).toContain("correct");
    expect(prompt).toContain("incorrect");
  });
});

describe("formatReplay", () => {
  it("returns empty string for empty history", () => {
    expect(formatReplay([])).toBe("");
  });

  it("formats history entries", () => {
    const replay = formatReplay([
      { question: "Q1", answer: "Yes" },
      { question: "Q2", answer: "No" },
    ]);
    expect(replay).toContain("Q1 → Yes");
    expect(replay).toContain("Q2 → No");
  });
});

describe("parseCharacter", () => {
  it("parses valid output", () => {
    const parsed = parseCharacter("名字：孙悟空\n简介：神话人物");
    expect(parsed).toEqual({ target: "孙悟空", summary: "神话人物" });
  });

  it("trims whitespace", () => {
    const parsed = parseCharacter("  名字： Alice \n  简介： A scientist  ");
    expect(parsed).toEqual({ target: "Alice", summary: "A scientist" });
  });

  it("returns undefined when target missing", () => {
    const parsed = parseCharacter("简介：Only summary");
    expect(parsed).toBeUndefined();
  });

  it("returns undefined when summary missing", () => {
    const parsed = parseCharacter("名字：Only name");
    expect(parsed).toBeUndefined();
  });

  it("returns undefined for empty", () => {
    expect(parseCharacter("")).toBeUndefined();
  });
});

describe("normalizeYesNoUnknown", () => {
  it.each([
    ["Yes", "Yes"],
    ["yes", "Yes"],
    ["YES", "Yes"],
    ["No", "No"],
    ["no", "No"],
    ["NO", "No"],
    ["Unknown", "Unknown"],
    ["unknown", "Unknown"],
    ["UNKNOWN", "Unknown"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeYesNoUnknown(input)).toBe(expected);
  });

  it("returns undefined for invalid", () => {
    expect(normalizeYesNoUnknown("Maybe")).toBeUndefined();
  });
});

describe("normalizeJudgement", () => {
  it.each([
    ["correct", "correct"],
    ["Correct", "correct"],
    ["CORRECT", "correct"],
    ["incorrect", "incorrect"],
    ["Incorrect", "incorrect"],
    ["INCORRECT", "incorrect"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeJudgement(input)).toBe(expected);
  });

  it("returns undefined for invalid", () => {
    expect(normalizeJudgement("maybe")).toBeUndefined();
  });
});

describe("buildErrorResult", () => {
  it("returns error envelope", () => {
    const result = buildErrorResult("no_active_game", "No active game");
    expect(result.content[0].text).toBe("No active game");
    expect(result.details).toEqual({ error: "no_active_game" });
    expect(result.isError).toBe(true);
  });
});

describe("buildSubmitSuccessResult", () => {
  it("reveals target and history", () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    recordAnswer(state, "Q1", "Yes");
    const result = buildSubmitSuccessResult(state, "Alice");
    expect(result.content[0].text).toContain("Alice");
    expect(result.content[0].text).toContain("A scientist");
    expect(result.details.correct).toBe(true);
    expect(result.details.target).toBe("Alice");
    expect(result.details.history).toEqual([{ question: "Q1", answer: "Yes" }]);
  });
});

describe("buildSubmitFailureResult", () => {
  it("keeps target hidden and records wrong guess", () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    recordWrongGuess(state, "Bob");
    const result = buildSubmitFailureResult(state, "Bob");
    expect(result.content[0].text).toBe("No");
    expect(result.details.correct).toBe(false);
    expect(result.details.target).toBeUndefined();
    expect(result.details.wrongGuesses).toEqual(["Bob"]);
  });
});
```

- [ ] **Step 3: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run format.test.ts`

Expected: FAIL — "not implemented" errors.

- [ ] **Step 4: Implement format.ts**

```typescript
import type { Category, GameState, GuessGameError, HistoryEntry } from "./types";

export function buildToolResult(text: string, details: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true as const } : {}),
  };
}

const CATEGORY_LABELS: Record<Category, string> = {
  any: "任意",
  science: "科学",
  sports: "体育",
  history: "历史",
  arts: "艺术",
  fictional: "虚构",
};

export function formatGenerationPrompt(category: Category): string {
  const categoryHint = category === "any" ? "" : `请选择与“${CATEGORY_LABELS[category]}”领域相关的人物。\n`;
  return `${categoryHint}请随机选择一位公众人物。可以是真实历史人物，也可以是虚构角色（如动漫、电影、小说、游戏中的人物）。

输出格式必须严格如下，不要有多余内容：

名字：<名字>
简介：<一句话描述，包含出处/国籍/领域/时代等关键信息>

例如：
名字：孙悟空
简介：中国古典小说《西游记》中的神话人物，神通广大，会七十二变。`;
}

export function formatRefereePrompt(target: string, summary: string, sessionId: string): string {
  return `【秘密人物】${target}
【简介】${summary}

你现在正在和用户玩“猜人物”游戏。用户会通过 Yes/No 问题来缩小范围。
规则：
1. 用户每次提出 Yes/No 问题后，你必须调用 ask_guess_question 工具，让系统根据【秘密人物】给出严格答案。不要自行回答。
2. 当用户尝试猜测具体人物时（例如“是 XXX 吗？”），你必须调用 submit_guess 工具进行判断。不要自行判断。
3. 在必须调用工具之外，你可以和用户进行简短的自然对话（例如宣布游戏开始、恭喜胜利、展示复盘），但不得泄露【秘密人物】，除非用户已经猜对。
4. 开局时请先向用户说：“我想好了一个人物。你可以开始用 Yes/No 问题提问，或随时直接猜测。”

当前游戏ID：${sessionId}`;
}

export function formatAnswerPrompt(target: string, summary: string, question: string): string {
  return `秘密人物：${target}
简介：${summary}

用户提问：${question}

请只回答以下三者之一：Yes / No / Unknown。
如果问题可以明确判断为真，回答 Yes。
如果问题可以明确判断为假，回答 No。
如果信息不足或问题本身无法明确判断，回答 Unknown。
不要输出任何其他文字。`;
}

export function formatJudgementPrompt(target: string, summary: string, guess: string): string {
  return `秘密人物：${target}
简介：${summary}

用户猜测：${guess}

请判断用户的猜测是否指代同一个秘密人物。考虑不同语言名称、昵称、别名、尊称等。如果基本等同，回答 correct；否则回答 incorrect。
只输出一个单词：correct 或 incorrect。`;
}

export function formatReplay(history: HistoryEntry[]): string {
  if (history.length === 0) return "";
  return history.map((h, i) => `${i + 1}. ${h.question} → ${h.answer}`).join("\n");
}

export function parseCharacter(text: string): { target: string; summary: string } | undefined {
  const lines = text.split("\n").map((line) => line.trim());
  let target: string | undefined;
  let summary: string | undefined;

  for (const line of lines) {
    if (line.startsWith("名字：")) {
      target = line.slice("名字：".length).trim();
    } else if (line.startsWith("简介：")) {
      summary = line.slice("简介：".length).trim();
    }
  }

  if (!target || target.length === 0 || !summary || summary.length === 0) {
    return undefined;
  }

  return { target, summary };
}

export function normalizeYesNoUnknown(text: string): "Yes" | "No" | "Unknown" | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  if (normalized === "unknown") return "Unknown";
  return undefined;
}

export function normalizeJudgement(text: string): "correct" | "incorrect" | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "correct") return "correct";
  if (normalized === "incorrect") return "incorrect";
  return undefined;
}

export function buildErrorResult(error: GuessGameError, message: string) {
  return buildToolResult(message, { error }, true);
}

export function buildSubmitSuccessResult(state: GameState, guess: string) {
  const replay = formatReplay(state.history);
  const text = `恭喜！你猜对了，答案是 ${state.target}。\n\n${state.summary}${
    replay ? "\n\n问答复盘：\n" + replay : ""
  }`;
  return buildToolResult(text, {
    guess,
    correct: true,
    target: state.target,
    summary: state.summary,
    history: state.history,
    wrongGuesses: state.wrongGuesses,
  });
}

export function buildSubmitFailureResult(state: GameState, guess: string) {
  return buildToolResult("No", {
    guess,
    correct: false,
    history: state.history,
    wrongGuesses: state.wrongGuesses,
  });
}
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run format.test.ts`

Expected: PASS — all tests pass.

- [ ] **Step 6: Check coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage format.test.ts`

Expected: Coverage report shows 100% for format.ts.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/format.ts pi-extensions/my-guess-game/format.test.ts
git commit -m "feat(my-guess-game): implement format helpers with full test coverage"
```

---

## Task 5: generate.ts (Character Generation) (TDD)

**Files:**
- Create: `pi-extensions/my-guess-game/generate.ts`
- Create: `pi-extensions/my-guess-game/generate.test.ts`

- [ ] **Step 1: Write generate.ts skeleton**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { Category, GeneratedCharacter } from "./types";
import { formatGenerationPrompt, parseCharacter } from "./format";

export type CompleteSimpleFn = typeof completeSimple;

export async function generateCharacter(
  category: Category,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<GeneratedCharacter | { error: string }> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write generate.test.ts**

```typescript
import { describe, it, expect, vi } from "vitest";
import { generateCharacter } from "./generate";
import type { Model, Api, AssistantMessage } from "@earendil-works/pi-ai";

function makeModel(): Model<Api> {
  return {
    id: "test-model",
    name: "Test Model",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("generateCharacter", () => {
  it("returns error when model is undefined", async () => {
    const result = await generateCharacter("any", undefined, vi.fn());
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("No model");
  });

  it("returns generated character on valid response", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("名字：孙悟空\n简介：神话人物"));
    const result = await generateCharacter("any", makeModel(), complete as any);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.target).toBe("孙悟空");
      expect(result.summary).toBe("神话人物");
    }
  });

  it("returns error when parse fails", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("invalid"));
    const result = await generateCharacter("any", makeModel(), complete as any);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("generation_failed");
  });

  it("passes category to prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("名字：孙悟空\n简介：神话人物"));
    await generateCharacter("science", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("科学");
  });
});
```

- [ ] **Step 3: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run generate.test.ts`

Expected: FAIL — "not implemented" errors.

- [ ] **Step 4: Implement generate.ts**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { Category, GeneratedCharacter } from "./types";
import { formatGenerationPrompt, parseCharacter } from "./format";

export type CompleteSimpleFn = typeof completeSimple;

export async function generateCharacter(
  category: Category,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<GeneratedCharacter | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatGenerationPrompt(category);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  const parsed = parseCharacter(text);
  if (!parsed) {
    return { error: "generation_failed" };
  }

  return parsed;
}
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run generate.test.ts`

Expected: PASS — all tests pass.

- [ ] **Step 6: Check coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage generate.test.ts`

Expected: Coverage report shows 100% for generate.ts.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/generate.ts pi-extensions/my-guess-game/generate.test.ts
git commit -m "feat(my-guess-game): implement character generation with full test coverage"
```

---

## Task 6: answer.ts (Yes/No/Unknown Answering) (TDD)

**Files:**
- Create: `pi-extensions/my-guess-game/answer.ts`
- Create: `pi-extensions/my-guess-game/answer.test.ts`

- [ ] **Step 1: Write answer.ts skeleton**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState, YesNoUnknown } from "./types";
import { formatAnswerPrompt, normalizeYesNoUnknown } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function answerQuestion(
  state: GameState,
  question: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<YesNoUnknown | { error: string }> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write answer.test.ts**

```typescript
import { describe, it, expect, vi } from "vitest";
import { answerQuestion } from "./answer";
import { createGameState } from "./state";
import type { Model, Api, AssistantMessage } from "@earendil-works/pi-ai";

function makeModel(): Model<Api> {
  return {
    id: "test-model",
    name: "Test Model",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("answerQuestion", () => {
  it("returns error when model is undefined", async () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", undefined, vi.fn());
    expect(typeof result === "object" && "error" in result).toBe(true);
  });

  it.each([
    ["Yes", "Yes"],
    ["No", "No"],
    ["Unknown", "Unknown"],
    ["yes", "Yes"],
    ["no", "No"],
    ["unknown", "Unknown"],
  ])("normalizes %s to %s", async (raw, expected) => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage(raw));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", makeModel(), complete as any);
    expect(result).toBe(expected);
  });

  it("falls back to Unknown on invalid response", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("Maybe"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await answerQuestion(state, "Q?", makeModel(), complete as any);
    expect(result).toBe("Unknown");
  });

  it("includes target and question in prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("Yes"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    await answerQuestion(state, "Is she real?", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("Is she real?");
  });
});
```

- [ ] **Step 3: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run answer.test.ts`

Expected: FAIL — "not implemented" errors.

- [ ] **Step 4: Implement answer.ts**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState, YesNoUnknown } from "./types";
import { formatAnswerPrompt, normalizeYesNoUnknown } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function answerQuestion(
  state: GameState,
  question: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<YesNoUnknown | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatAnswerPrompt(state.target, state.summary, question);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  return normalizeYesNoUnknown(text) ?? "Unknown";
}
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run answer.test.ts`

Expected: PASS — all tests pass.

- [ ] **Step 6: Check coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage answer.test.ts`

Expected: Coverage report shows 100% for answer.ts.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/answer.ts pi-extensions/my-guess-game/answer.test.ts
git commit -m "feat(my-guess-game): implement yes/no/unknown answering with full test coverage"
```

---

## Task 7: judge.ts (Guess Matching) (TDD)

**Files:**
- Create: `pi-extensions/my-guess-game/judge.ts`
- Create: `pi-extensions/my-guess-game/judge.test.ts`

- [ ] **Step 1: Write judge.ts skeleton**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState } from "./types";
import { formatJudgementPrompt, normalizeJudgement } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function judgeGuess(
  state: GameState,
  guess: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<boolean | { error: string }> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write judge.test.ts**

```typescript
import { describe, it, expect, vi } from "vitest";
import { judgeGuess } from "./judge";
import { createGameState } from "./state";
import type { Model, Api, AssistantMessage } from "@earendil-works/pi-ai";

function makeModel(): Model<Api> {
  return {
    id: "test-model",
    name: "Test Model",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "openai",
    model: "test-model",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("judgeGuess", () => {
  it("returns error when model is undefined", async () => {
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", undefined, vi.fn());
    expect(typeof result === "object" && "error" in result).toBe(true);
  });

  it.each([
    ["correct", true],
    ["Correct", true],
    ["CORRECT", true],
    ["incorrect", false],
    ["Incorrect", false],
    ["INCORRECT", false],
  ])("judges %s as %s", async (raw, expected) => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage(raw));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", makeModel(), complete as any);
    expect(result).toBe(expected);
  });

  it("treats invalid judgement as incorrect", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("maybe"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    const result = await judgeGuess(state, "Alice", makeModel(), complete as any);
    expect(result).toBe(false);
  });

  it("includes target and guess in prompt", async () => {
    const complete = vi.fn().mockResolvedValue(makeAssistantMessage("correct"));
    const state = createGameState("s1", "Alice", "A scientist", "any");
    await judgeGuess(state, "Alice", makeModel(), complete as any);
    const prompt = complete.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("秘密人物：Alice");
    expect(prompt).toContain("用户猜测：Alice");
  });
});
```

- [ ] **Step 3: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run judge.test.ts`

Expected: FAIL — "not implemented" errors.

- [ ] **Step 4: Implement judge.ts**

```typescript
import { completeSimple, type Model, type Api } from "@earendil-works/pi-ai";
import type { GameState } from "./types";
import { formatJudgementPrompt, normalizeJudgement } from "./format";
import type { CompleteSimpleFn } from "./generate";

export async function judgeGuess(
  state: GameState,
  guess: string,
  model: Model<Api> | undefined,
  complete: CompleteSimpleFn,
): Promise<boolean | { error: string }> {
  if (!model) {
    return { error: "no_llm" };
  }

  const prompt = formatJudgementPrompt(state.target, state.summary, guess);
  const response = await complete(model, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  const judgement = normalizeJudgement(text);
  if (judgement === undefined) {
    return { error: "ambiguous_guess" };
  }

  return judgement === "correct";
}
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run judge.test.ts`

Expected: PASS — all tests pass.

- [ ] **Step 6: Check coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage judge.test.ts`

Expected: Coverage report shows 100% for judge.ts.

- [ ] **Step 7: Commit**

```bash
git add pi-extensions/my-guess-game/judge.ts pi-extensions/my-guess-game/judge.test.ts
git commit -m "feat(my-guess-game): implement guess judgement with full test coverage"
```

---

## Task 8: index.ts (Extension Glue + Tools)

**Files:**
- Create: `pi-extensions/my-guess-game/index.ts`
- Create: `pi-extensions/my-guess-game/index.test.ts`

- [ ] **Step 1: Write index.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const registeredTools: any[] = [];

const mockPi = {
  registerTool: vi.fn((def: any) => {
    registeredTools.push(def);
  }),
};

function makeCtx(sessionId: string, hasModel = true): ExtensionContext {
  return {
    sessionManager: {
      getSessionId: vi.fn(() => sessionId),
    },
    model: hasModel
      ? {
          id: "test-model",
          name: "Test",
          api: "openai-responses",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        }
      : undefined,
    hasUI: false,
  } as unknown as ExtensionContext;
}

async function loadModule() {
  return await import("./index");
}

beforeEach(() => {
  registeredTools.length = 0;
  vi.clearAllMocks();
});

describe("my-guess-game extension", () => {
  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers three tools", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    expect(registeredTools.map((t) => t.name)).toEqual([
      "play_guess_game",
      "ask_guess_question",
      "submit_guess",
    ]);
  });

  it("play_guess_game returns error when no model", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "play_guess_game");
    const result = await tool.execute("tc", {}, undefined, undefined, makeCtx("s1", false));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_llm");
  });

  it("ask_guess_question returns no_active_game when missing", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "ask_guess_question");
    const result = await tool.execute("tc", { question: "Q?" }, undefined, undefined, makeCtx("s1"));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_active_game");
  });

  it("submit_guess returns no_active_game when missing", async () => {
    const mod = await loadModule();
    mod.default(mockPi as unknown as ExtensionAPI);
    const tool = registeredTools.find((t) => t.name === "submit_guess");
    const result = await tool.execute("tc", { guess: "Alice" }, undefined, undefined, makeCtx("s1"));
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("no_active_game");
  });
});
```

- [ ] **Step 2: Run tests — confirm failures**

Run: `cd pi-extensions/my-guess-game && npx vitest run index.test.ts`

Expected: FAIL — module not found or missing tool names.

- [ ] **Step 3: Implement index.ts**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { completeSimple } from "@earendil-works/pi-ai";
import {
  PlayGuessGameParamsSchema,
  AskGuessQuestionParamsSchema,
  SubmitGuessParamsSchema,
  type PlayGuessGameParams,
  type AskGuessQuestionParams,
  type SubmitGuessParams,
  type GameState,
  type Category,
} from "./types";
import { createGameStore, createGameState, recordAnswer, recordWrongGuess } from "./state";
import { generateCharacter } from "./generate";
import { answerQuestion } from "./answer";
import { judgeGuess } from "./judge";
import {
  buildToolResult,
  buildErrorResult,
  buildSubmitSuccessResult,
  buildSubmitFailureResult,
  formatRefereePrompt,
} from "./format";

const store = createGameStore();

export default function myGuessGame(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "play_guess_game",
    label: "Play Guess Game",
    description:
      "Start a new Yes/No guess-the-character game. The extension will think of a public figure (real or fictional). Use ask_guess_question to ask Yes/No questions and submit_guess to make a final guess.",
    promptSnippet: "Start a Yes/No guess-the-character game",
    promptGuidelines: [
      "Use play_guess_game when the user wants to start a guess-the-character game.",
      "After the game starts, the user will ask Yes/No questions. Route every question through ask_guess_question.",
      "When the user makes a final guess, route it through submit_guess.",
      "Do not reveal the secret character unless submit_guess returns correct=true.",
    ],
    parameters: PlayGuessGameParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      if (store.has(sessionId)) {
        return buildErrorResult("game_already_active", "A game is already active in this session. Submit a guess or finish it first.");
      }

      const category: Category = params.category ?? "any";
      const generated = await generateCharacter(category, ctx.model, completeSimple);
      if ("error" in generated) {
        return buildErrorResult(generated.error as any, `Failed to start game: ${generated.error}`);
      }

      const state = createGameState(sessionId, generated.target, generated.summary, category);
      store.set(sessionId, state);

      const prompt = formatRefereePrompt(state.target, state.summary, sessionId);
      return buildToolResult(prompt, {
        target: state.target,
        summary: state.summary,
        category: state.category,
        sessionId,
      });
    },
  });

  pi.registerTool({
    name: "ask_guess_question",
    label: "Ask Guess Question",
    description:
      "Ask a Yes/No question about the secret character in the current guess game. Returns exactly Yes, No, or Unknown.",
    promptSnippet: "Ask a Yes/No question about the secret character",
    promptGuidelines: [
      "Use ask_guess_question for every Yes/No question the user asks during an active game.",
      "The tool returns only Yes, No, or Unknown.",
      "Do not answer the question yourself in chat.",
    ],
    parameters: AskGuessQuestionParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const state = store.get(sessionId);
      if (!state) {
        return buildErrorResult("no_active_game", "No active game. Start one with play_guess_game.");
      }

      const answer = await answerQuestion(state, params.question, ctx.model, completeSimple);
      if (typeof answer === "object" && "error" in answer) {
        return buildErrorResult(answer.error as any, `Failed to answer: ${answer.error}`);
      }

      recordAnswer(state, params.question, answer);
      return buildToolResult(answer, {
        question: params.question,
        answer,
        questionCount: state.history.length,
      });
    },
  });

  pi.registerTool({
    name: "submit_guess",
    label: "Submit Guess",
    description:
      "Submit a final guess for the secret character in the current guess game. The extension judges whether it matches and ends the game if correct.",
    promptSnippet: "Submit a final guess for the secret character",
    promptGuidelines: [
      "Use submit_guess when the user names a specific character they think is the answer.",
      "If correct, the game ends and the secret character is revealed.",
      "If incorrect, the game continues and the wrong guess is recorded.",
    ],
    parameters: SubmitGuessParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const state = store.get(sessionId);
      if (!state) {
        return buildErrorResult("no_active_game", "No active game. Start one with play_guess_game.");
      }

      const result = await judgeGuess(state, params.guess, ctx.model, completeSimple);
      if (typeof result === "object" && "error" in result) {
        return buildErrorResult(result.error as any, `Failed to judge guess: ${result.error}`);
      }

      if (result) {
        const success = buildSubmitSuccessResult(state, params.guess);
        store.delete(sessionId);
        return success;
      }

      recordWrongGuess(state, params.guess);
      return buildSubmitFailureResult(state, params.guess);
    },
  });
}
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `cd pi-extensions/my-guess-game && npx vitest run index.test.ts`

Expected: PASS — all integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-guess-game/index.ts pi-extensions/my-guess-game/index.test.ts
git commit -m "feat(my-guess-game): implement extension glue with three tools"
```

---

## Task 9: Build, Test, and Deploy

**Files:**
- Modify: `pi-extensions/my-guess-game/package.json` (no changes needed)
- Create: `pi-extensions/my-guess-game/dist/index.js` (build output)

- [ ] **Step 1: Run full test suite with coverage**

Run: `cd pi-extensions/my-guess-game && npx vitest run --coverage`

Expected: All tests pass. Coverage report shows:
- `state.ts`: 100% branches, 100% functions, 100% lines, 100% statements
- `format.ts`: 100% across all metrics
- `generate.ts`: 100% across all metrics
- `answer.ts`: 100% across all metrics
- `judge.ts`: 100% across all metrics
- `index.ts`: excluded (does not count against coverage)
- `types.ts`: excluded

- [ ] **Step 2: Build extension**

Run: `cd pi-extensions/my-guess-game && bun run build`

Expected: `dist/index.js` created successfully.

- [ ] **Step 3: Verify build output exists**

Run: `ls -la pi-extensions/my-guess-game/dist/`

Expected: `index.js` present.

- [ ] **Step 4: Deploy to Pi extensions directory**

Run: `cd pi-extensions/my-guess-game && bun run deploy`

Expected: Files copied to `~/.pi/agent/extensions/my-guess-game/`.

Verify: `ls -la ~/.pi/agent/extensions/my-guess-game/`

Expected: `index.js` and `my-guess-game.json` present.

- [ ] **Step 5: Final commit**

```bash
git add pi-extensions/my-guess-game/
git commit -m "feat(my-guess-game): complete extension with build and deploy"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Section | Implementing Task |
|--------------|-------------------|
| Three tools: `play_guess_game`, `ask_guess_question`, `submit_guess` | Task 8 (index.ts) |
| Optional `category` parameter with 6 values | Task 2 (types.ts) + Task 8 |
| LLM-generated target (name + summary) | Task 5 (generate.ts) |
| Real and fictional characters allowed | Task 5 prompt |
| Session-based in-memory state | Task 3 (state.ts) + Task 8 |
| One active game per session | Task 8 `play_guess_game` guard |
| Yes/No/Unknown answers only | Task 6 (answer.ts) |
| Invalid answers fall back to Unknown | Task 6 (answer.ts) |
| Correct guess ends game and reveals target | Task 8 `submit_guess` |
| Incorrect guess keeps game active | Task 8 `submit_guess` |
| Error codes: `no_llm`, `generation_failed`, `game_already_active`, `no_active_game`, `invalid_answer`, `ambiguous_guess` | Task 2 + Task 4 + Task 5 + Task 6 + Task 7 + Task 8 |
| TDD with 100% coverage on pure modules | Tasks 3–7 |
| Build and deploy scripts | Task 1 + Task 9 |

**No gaps.**

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later"
- No vague directives like "add appropriate error handling"
- No "similar to Task N" references
- Every step has exact code, exact commands, exact expected output

### 3. Type Consistency

- `Category` type derived from `CategorySchema`
- `YesNoUnknown` type used consistently in `HistoryEntry`, `answer.ts`, `format.ts`
- `CompleteSimpleFn` type shared across `generate.ts`, `answer.ts`, `judge.ts`
- Tool parameter schemas match the types used in `index.ts`
- Result `details` shapes match the interfaces in `types.ts`

**All consistent.**
