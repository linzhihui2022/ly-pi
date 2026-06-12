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
