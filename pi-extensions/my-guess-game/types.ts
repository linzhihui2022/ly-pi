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
