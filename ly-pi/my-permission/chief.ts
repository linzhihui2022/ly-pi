import type { DirectModelBinding } from "./direct-model";
import type { AnalyzerConfig } from "./pipeline";
import {
  createRoleAnalyzer,
  createMerger as createSharedMerger,
} from "./pipeline";
import type { ModelClient } from "./types";

// ---- types ----

export interface ChiefSuggestionItem {
  type: "add" | "remove" | "modify" | "merge";
  rule?: string;
  oldRule?: string;
  newRule?: string;
  oldRules?: string[];
  reason: string;
}

export interface ChiefSuggestion {
  suggestions: ChiefSuggestionItem[];
  summary: string;
}

export interface ChiefResult {
  suggestion?: ChiefSuggestion;
  error?: string;
  cost?: number;
  modelUsed?: string;
}

export interface ChiefMergeResult {
  mergedText?: string;
  error?: string;
  cost?: number;
  modelUsed?: string;
}

export type ChiefFn = (
  currentJudgeMd: string,
  judgePrompt: string,
  cwd: string,
  instruction: string | undefined,
) => Promise<ChiefResult>;

export type ChiefMergerFn = (
  currentJudgeMd: string,
  selectedSuggestions: ChiefSuggestionItem[],
) => Promise<ChiefMergeResult>;

// ---- Role config (used by pipeline.ts) ----

interface ChiefAnalyzerInput {
  currentJudgeMd: string;
  judgePrompt: string;
  cwd: string;
  instruction?: string;
}

export const chiefAnalyzerConfig: AnalyzerConfig<
  ChiefAnalyzerInput,
  ChiefSuggestion
> = {
  systemPrompt: [
    "你是 my-permission 权限系统的审判长（Chief Judge）。",
    "你的任务不是看案例，而是直接审视 JUDGE.md 规则文件本身的质量。",
    "",
    "## 审查维度",
    "",
    "1. **矛盾规则**：两条规则覆盖同一场景但结论相反（一条 allow，一条 deny）",
    "2. **过宽规则**：一条 allow 规则的范围远超实际需要，留下了安全隐患",
    "3. **可合并规则**：多条规则表述不同但语义相同或可以归纳为更精炼的一条",
    "4. **遗漏盲区**：应该覆盖但完全没有规则保护的重要安全场景",
    "5. **冗余规则**：语义已被其他规则完全覆盖的多余规则",
    "",
    "## 输出格式",
    "",
    "只回复严格 JSON，不要包含其他文字：",
    "{",
    '  "suggestions": [',
    '    {"type": "add", "rule": "新规则文本", "reason": "添加原因"},',
    '    {"type": "remove", "rule": "要删除的规则原文", "reason": "删除原因"},',
    '    {"type": "modify", "oldRule": "当前规则原文", "newRule": "改写后的规则", "reason": "改写原因"},',
    '    {"type": "merge", "oldRules": ["规则1原文", "规则2原文"], "newRule": "合并后的规则", "reason": "合并原因"}',
    "  ],",
    '  "summary": "审计 N 条规则，发现 ..."',
    "}",
    "",
    "关键规则：",
    "- oldRule/oldRules 必须精确匹配 JUDGE.md 中的原文（一字不差）",
    "- newRule 保持原风格的祈使句，一行一条",
    "- 只报告确实存在的问题，不要为了凑数而误报",
    "- 如果没有问题，suggestions 设为空数组 []",
    "- 直接输出 JSON，不要 markdown 代码块",
  ].join("\n"),
  buildUserPrompt: (input) =>
    buildChiefPrompt(
      input.currentJudgeMd,
      input.judgePrompt,
      input.cwd,
      input.instruction,
    ),
  parseResult: parseChiefJson,
  emptyInputError: "项目尚未创建 JUDGE.md，无需审计",
  modelLabel: "chief",
};

// ---- createChief (thin wrapper) ----

export function createChief(
  modelClient: ModelClient,
  binding: DirectModelBinding,
): ChiefFn {
  const analyzer = createRoleAnalyzer(
    chiefAnalyzerConfig,
    modelClient,
    binding,
  );

  return async function analyze(
    currentJudgeMd: string,
    judgePrompt: string,
    cwd: string,
    instruction: string | undefined,
  ): Promise<ChiefResult> {
    if (!currentJudgeMd.trim()) {
      return { error: "项目尚未创建 JUDGE.md，无需审计" };
    }

    const result = await analyzer(
      { currentJudgeMd, judgePrompt, cwd, instruction },
      cwd,
      currentJudgeMd,
      judgePrompt,
    );

    return {
      suggestion: result.result,
      error: result.error,
      cost: result.cost,
      modelUsed: result.modelUsed,
    };
  };
}

// ---- createChiefMerger (thin wrapper) ----

export function createChiefMerger(
  modelClient: ModelClient,
  binding: DirectModelBinding,
): ChiefMergerFn {
  const sharedMerger = createSharedMerger(modelClient, binding);

  return async function merge(
    currentJudgeMd: string,
    selectedSuggestions: ChiefSuggestionItem[],
  ): Promise<ChiefMergeResult> {
    const result = await sharedMerger({
      current: currentJudgeMd,
      operations: selectedSuggestions,
    });
    return {
      mergedText: result.mergedText,
      error: result.error,
      cost: result.cost,
      modelUsed: result.modelUsed,
    };
  };
}

// ---- Prompt builder & JSON parser (role-specific, unchanged) ----

function buildChiefPrompt(
  currentJudgeMd: string,
  judgePrompt: string,
  cwd: string,
  instruction?: string,
): string {
  const parts = [
    "以下是 my-permission 权限系统当前使用的 JUDGE.md 和法官提示词。",
    "请从规则本身出发，审计 JUDGE.md 的质量。",
  ];

  if (instruction) {
    parts.push("", "## 用户额外要求", "", instruction);
  }

  parts.push(
    "",
    `当前项目工作目录: ${cwd}`,
    "",
    "---",
    "",
    "## 法官提示词（理解规则使用场景）",
    "",
    "```",
    judgePrompt || "（未加载）",
    "```",
    "",
    "---",
    "",
    `## 当前 JUDGE.md（共 ${currentJudgeMd.split("\n").filter((l) => l.trim()).length} 条规则）`,
    "",
    currentJudgeMd,
  );

  return parts.join("\n");
}

function parseChiefJson(text: string): ChiefSuggestion | undefined {
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) return undefined;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const p = parsed as Record<string, unknown>;
    if (!Array.isArray(p.suggestions) || typeof p.summary !== "string") {
      return undefined;
    }
    const suggestions = (p.suggestions as unknown[]).filter(
      (item): item is ChiefSuggestionItem => {
        if (typeof item !== "object" || item === null) return false;
        const s = item as Record<string, unknown>;
        if (
          typeof s.type !== "string" ||
          !["add", "remove", "modify", "merge"].includes(s.type)
        )
          return false;
        if (typeof s.reason !== "string") return false;
        switch (s.type) {
          case "add":
            return typeof s.rule === "string";
          case "remove":
            return typeof s.rule === "string";
          case "modify":
            return (
              typeof s.oldRule === "string" && typeof s.newRule === "string"
            );
          case "merge":
            return (
              Array.isArray(s.oldRules) &&
              s.oldRules.every((r: unknown) => typeof r === "string") &&
              typeof s.newRule === "string"
            );
          default:
            return false;
        }
      },
    );
    return { suggestions, summary: p.summary };
  } catch {
    return undefined;
  }
}
