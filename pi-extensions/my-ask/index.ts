import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ENVELOPE_PREFIX,
  buildQuestionnaireResponse,
  buildToolResult,
} from "./format.js";
import { createQuestionnaire } from "./questionnaire.js";
import {
  QuestionParamsSchema,
  type QuestionParams,
  type QuestionnaireResult,
} from "./types.js";
import { ERROR_NO_UI, validateQuestionnaire } from "./validate.js";

const PROMPT_SNIPPET =
  "Ask the user up to 4 structured questions (2-4 options each) when requirements are ambiguous";

const PROMPT_GUIDELINES = [
  "Use ask_user_question whenever the user's request is underspecified and you cannot proceed without concrete decisions — you can ask up to 4 questions per invocation.",
  'Each question MUST have 2-4 options. Every option requires a concise label (1-5 words) and a description explaining what the choice means or its trade-offs. The user can additionally type a custom answer ("Type something." row is appended automatically to single-select questions) or pick "Chat about this" to abandon the questionnaire.',
  'Set multiSelect: true when multiple answers are valid; the "Type something." row is available in multi-select too, allowing users to add custom values alongside standard options. Provide an options[].preview markdown string when an option benefits from richer context (mockups, code snippets, diagrams, configs) — single-select only. NOTE: any non-empty preview on a single-select question ALSO suppresses the "Type something." row; "Chat about this" remains the escape hatch. If you recommend a specific option, make it the first option and append "(Recommended)" to its label.',
  "Do not stack multiple ask_user_question calls back-to-back — group all clarifying questions into one invocation.",
];

export default function myAsk(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User Question",
    description: `Ask the user one or more structured questions during execution. Use when you need to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- Users will always be able to type a custom answer ("Type something." row is appended automatically to every single-select question) or pick "Chat about this" to abandon the questionnaire and continue in free-form conversation. Do NOT author "Other" / "Type something." / "Chat about this" labels yourself — duplicates are rejected at runtime.
- Use multiSelect: true to allow multiple answers to be selected for a question. The "Type something." row is available in multi-select too, allowing users to add custom values alongside standard options. It is suppressed on single-select questions where any option carries a \`preview\` (no room for inline custom text — "Chat about this" remains the escape hatch).
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" to the end of the label.

Preview feature:
Use the optional \`preview\` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

Preview content is rendered as markdown in a monospace box. Multi-line text with newlines is supported. Do not use previews for simple preference questions where labels and descriptions suffice. Note: previews are only supported for single-select questions (not multiSelect).`,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: QuestionParamsSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return buildToolResult(ERROR_NO_UI, {
          answers: [],
          cancelled: true,
          error: "no_ui",
        });
      }

      const typed = params as QuestionParams;
      const validation = validateQuestionnaire(typed);
      if (!validation.ok) {
        return buildToolResult(validation.message, {
          answers: [],
          cancelled: true,
          error: validation.error,
        });
      }

      const result = await ctx.ui.custom<QuestionnaireResult>(
        (tui, theme, _kb, done) => {
          return createQuestionnaire(typed, tui, theme, done);
        },
      );

      return buildQuestionnaireResponse(result, typed);
    },
  });
}
