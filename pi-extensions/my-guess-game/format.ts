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
