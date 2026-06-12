# Guess Game Spec

> Status: pending user review  
> Date: 2026-06-12  
> Topic: Pi extension for a Yes/No "guess the character" game  

## 1. Goal

Build a Pi extension `my-guess-game` that hosts a Yes/No guessing game.
The extension thinks of a public figure (real or fictional) and answers the
user's questions with only `Yes`, `No`, or `Unknown`. The user can submit a
guess at any time; the extension judges whether the guess matches the secret
character.

## 2. Design philosophy

- **Stateful session game**: the extension stores the secret character in
  memory keyed by `sessionId` so every answer and judgement stays consistent.
- **LLM-generated target**: each game starts with a fresh LLM call that picks
  a character and returns a short summary.
- **Strict Yes/No/Unknown referee**: questions are routed through a dedicated
  tool that forces the LLM to answer with one of the three allowed words.
- **Lightweight TUI-free flow**: the primary interaction happens in normal
  chat; tools are used where consistency matters (answer a question, submit a
  guess).
- **Replay on win/loss**: when a guess is submitted, the extension returns the
  full question history so the LLM can present a concise replay.

## 3. Module layout

```
pi-extensions/my-guess-game/
├── index.ts              # extension entry point: register tools
├── types.ts              # typebox schemas + internal types
├── state.ts              # in-memory game state store
├── generate.ts           # LLM character generation
├── answer.ts             # LLM Yes/No/Unknown answering
├── judge.ts              # guess matching judgement
├── format.ts             # result formatting helpers
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── SPEC.md               # this document
├── REQUIREMENTS.md       # requirement checklist
└── scripts/deploy.ts     # deploy to ~/.pi/agent/extensions/my-guess-game
```

Dependency direction:

```
index.ts → generate.ts → types.ts
         → answer.ts  ────┘
         → judge.ts   ────┘
         → state.ts   ────┘
         → format.ts  ────┘
```

## 4. Tools

### 4.1 `play_guess_game` — Start a new game

**Parameters**

```ts
const PlayGuessGameParamsSchema = Type.Object({
  category: Type.Optional(
    Type.Union([
      Type.Literal("any"),
      Type.Literal("science"),
      Type.Literal("sports"),
      Type.Literal("history"),
      Type.Literal("arts"),
      Type.Literal("fictional"),
    ], { default: "any" })
  ),
});
```

**Execution**

1. Reject if the current session already has an active game (`game_already_active`).
2. Call the LLM with the generation prompt (section 5.1).
3. Parse the returned `名字` and `简介`.
4. Store the game state keyed by `ctx.sessionId` (section 6).
5. Return the referee prompt (section 5.2) plus structured details.

**Result shape**

```ts
interface PlayGuessGameResult {
  content: [{ text: string }];
  details: {
    target: string;
    summary: string;
    category: string;
    sessionId: string;
  };
}
```

The `content[0].text` tells the LLM the secret character and the rules of
engagement. The LLM is expected to greet the user and invite questions.

### 4.2 `ask_guess_question` — Ask a Yes/No question

**Parameters**

```ts
const AskGuessQuestionParamsSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
});
```

**Execution**

1. Look up the active game for `ctx.sessionId`; return `no_active_game` if missing.
2. Call the LLM with the answer prompt (section 5.3).
3. Parse the response, accepting only `Yes`, `No`, or `Unknown` (case-insensitive).
4. Append `{ question, answer }` to `state.history`.
5. Return the answer to the LLM.

**Result shape**

```ts
interface AskGuessQuestionResult {
  content: [{ text: string }];  // "Yes" | "No" | "Unknown"
  details: {
    question: string;
    answer: "Yes" | "No" | "Unknown";
    questionCount: number;
  };
}
```

### 4.3 `submit_guess` — Submit a final guess

**Parameters**

```ts
const SubmitGuessParamsSchema = Type.Object({
  guess: Type.String({ minLength: 1 }),
});
```

**Execution**

1. Look up the active game for `ctx.sessionId`; return `no_active_game` if missing.
2. Call the LLM with the judgement prompt (section 5.4).
3. Parse the response as `correct` or `incorrect`.
4. If correct, return the answer, replay the question history, and delete the
   game state.
5. If incorrect, record the wrong guess, keep the game active, and return
   `"No"`.

**Result shape**

```ts
interface SubmitGuessResult {
  content: [{ text: string }];
  details: {
    guess: string;
    correct: boolean;
    target: string;               // revealed only when correct
    summary: string;              // revealed only when correct
    history: Array<{ question: string; answer: string }>;
    wrongGuesses: string[];
  };
}
```

## 5. Prompts

### 5.1 Character generation prompt

```
请随机选择一位公众人物。可以是真实历史人物，也可以是虚构角色
（如动漫、电影、小说、游戏中的人物）。

输出格式必须严格如下，不要有多余内容：

名字：<名字>
简介：<一句话描述，包含出处/国籍/领域/时代等关键信息>

例如：
名字：孙悟空
简介：中国古典小说《西游记》中的神话人物，神通广大，会七十二变。
```

If `category` is not `any`, prepend the constraint:

```
请选择与“<category>”领域相关的人物。
```

### 5.2 Referee prompt returned by `play_guess_game`

```
【秘密人物】{target}
【简介】{summary}

你现在正在和用户玩“猜人物”游戏。用户会通过 Yes/No 问题来缩小范围。
规则：
1. 用户每次提出 Yes/No 问题后，你必须调用 ask_guess_question 工具，
   让系统根据【秘密人物】给出严格答案。不要自行回答。
2. 当用户尝试猜测具体人物时（例如“是 XXX 吗？”），你必须调用
   submit_guess 工具进行判断。不要自行判断。
3. 在必须调用工具之外，你可以和用户进行简短的自然对话（例如宣布游戏开始、
   恭喜胜利、展示复盘），但不得泄露【秘密人物】，除非用户已经猜对。
4. 开局时请先向用户说：“我想好了一个人物。你可以开始用 Yes/No 问题提问，
   或随时直接猜测。”

当前游戏ID：{sessionId}
```

### 5.3 Yes/No/Unknown answer prompt

```
秘密人物：{target}
简介：{summary}

用户提问：{question}

请只回答以下三者之一：Yes / No / Unknown。
如果问题可以明确判断为真，回答 Yes。
如果问题可以明确判断为假，回答 No。
如果信息不足或问题本身无法明确判断，回答 Unknown。
不要输出任何其他文字。
```

### 5.4 Guess judgement prompt

```
秘密人物：{target}
简介：{summary}

用户猜测：{guess}

请判断用户的猜测是否指代同一个秘密人物。考虑不同语言名称、昵称、
别名、尊称等。如果基本等同，回答 correct；否则回答 incorrect。
只输出一个单词：correct 或 incorrect。
```

## 6. Game state

```ts
interface GameState {
  sessionId: string;
  target: string;
  summary: string;
  category: string;
  startedAt: number;
  history: Array<{ question: string; answer: "Yes" | "No" | "Unknown" }>;
  wrongGuesses: string[];
}
```

Stored in memory only, keyed by `sessionId`. No persistence across Pi restarts.

## 7. Error codes

| Code | Meaning |
|---|---|
| `no_llm` | The extension cannot call the LLM in this environment. |
| `generation_failed` | Character generation failed or could not be parsed. |
| `game_already_active` | The session already has an active game. |
| `no_active_game` | No active game found for this session. |
| `invalid_answer` | The LLM returned something other than Yes/No/Unknown. |
| `ambiguous_guess` | The judgement could not be resolved to correct/incorrect. |

## 8. Testing

| Module | Test style | Coverage target |
|---|---|---|
| `state.ts` | pure in-memory store unit tests | 100% |
| `generate.ts` | mocked LLM adapter unit tests | 100% |
| `answer.ts` | mocked LLM adapter unit tests | 100% |
| `judge.ts` | mocked LLM adapter unit tests | 100% |
| `format.ts` | pure function unit tests | 100% |
| `index.ts` | mocked `ExtensionAPI` integration | excluded |
| `types.ts` | type definitions only | excluded |

Key scenarios:

1. Start a game with each category.
2. Reject starting a second game while one is active.
3. Answer questions returning Yes, No, Unknown.
4. Reject invalid LLM answers and fall back to Unknown.
5. Correct guess ends the game and reveals the target.
6. Incorrect guess keeps the game active and records the wrong guess.
7. Tools return `no_active_game` when no game exists.
8. Question history is preserved across multiple `ask_guess_question` calls.

## 9. Deployment

1. `bunx turbo run build` → `dist/index.js`
2. `bun run deploy` copies `dist/index.js` to `~/.pi/agent/extensions/my-guess-game/index.js`
3. In Pi run `/reload`

## 10. Excluded features

| Feature | Reason |
|---|---|
| TUI / custom UI | Design decision: keep the game in natural chat. |
| Persistent storage | Single-session games are sufficient for casual play. |
| Multi-game sessions | One active game per Pi session keeps state simple. |
| Scoreboard / statistics | Out of scope for the first version. |
| Multi-language target output | Start with Chinese target names; English summaries optional. |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-06-12 | Initial spec: session-based state, LLM-generated target, three tools. |
