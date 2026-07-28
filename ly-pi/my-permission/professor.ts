import type { Api, Model } from "@earendil-works/pi-ai";
import type { AnalyzerConfig } from "./pipeline";
import { createMerger as createSharedMerger, createRoleAnalyzer } from "./pipeline";
import type { DeniedThenApproved } from "./stats";
import type { Config } from "./types";

export interface AdvocateSuggestion {
  add: Array<{ rule: string; reason: string }>;
  remove: string[];
}

export interface AdvocateResult {
  suggestion?: AdvocateSuggestion;
  mergedText?: string;
  error?: string;
  cost?: number;
}

export type AdvocateFn = (
  cases: DeniedThenApproved[],
  cwd: string,
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  getAuth: (
    model: Model<Api>,
  ) => Promise<
    { apiKey?: string; headers?: Record<string, string> } | undefined
  >,
  currentJudgeMd: string,
  judgePrompt: string,
) => Promise<AdvocateResult>;

export type MergerFn = (
  currentJudgeMd: string,
  selectedRules: string[],
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  getAuth: (
    model: Model<Api>,
  ) => Promise<
    { apiKey?: string; headers?: Record<string, string> } | undefined
  >,
) => Promise<AdvocateResult>;

// ---- Role config (used by pipeline.ts) ----

export const advocateAnalyzerConfig: AnalyzerConfig<
  DeniedThenApproved[],
  AdvocateSuggestion
> = {
  systemPrompt: [
    "你是 my-permission 权限系统的安全策略分析师。",
    "",
    "## 系统架构",
    "",
    "权限系统分两层：",
    "1. 规则层：模式匹配，直接 allow/deny",
    "2. 法官：LLM 判定者，对规则层未命中的操作做出判定",
    "",
    "## 你的任务",
    "",
    "分析法官的假阳性案例，输出结构化的 JUDGE.md 优化建议。",
    "",
    "## 输出格式",
    "",
    "只回复严格 JSON，不要包含其他文字：",
    "{",
    '  "add": [',
    '    { "rule": "新规则文本", "reason": "添加原因" }',
    "  ],",
    '  "remove": ["应删除的规则原文"]',
    "}",
    "",
    "add: 建议新增的规则，每条包含 rule（一行祈使句）和 reason（一句话原因）。如果没有新增，设为空数组 []。",
    "remove: 当前 JUDGE.md 中过时或错误的规则（必须匹配原文）。如果没有需删除的，设为空数组 []。",
    "",
    "注意：当前 JUDGE.md 中未出现在 remove 里的规则将自动保留，不需要在 JSON 中列出。",
    "关键：不要建议当前 JUDGE.md 中已存在的规则。如果案例已被现有规则覆盖，则不需要添加。",
    "",
    "判断「重复」的标准是语义覆盖，不是字面匹配。例如：",
    "- 已有「允许执行 bun run deploy」→ 不要再建议「允许执行 bun run scripts/deploy.ts」",
    "- 已有「允许读取 .pi/agent/ 下配置文件」→ 不要再建议「允许读取 models-store.json」",
    "",
    "add 里的每一条都必须是当前 JUDGE.md 完全无法覆盖的新模式。",
    "",
    "## 规则",
    "",
    "- 只从可归纳的简单案例中提取模式，忽略多行长脚本等复杂案例",
    "- 每条 rule 一句话，用祈使句，不超过一行",
    '- reason 一句话说明原因（如"被误判 5 次"）',
    "- 如果当前 JUDGE.md 已完美，所有数组为空",
    "- 直接输出 JSON，不要 markdown 代码块",
  ].join("\n"),
  buildUserPrompt: (cases, cwd, currentJudgeMd, judgePrompt) =>
    buildAdvocatePrompt(cases, currentJudgeMd, judgePrompt, cwd),
  parseResult: parseAdvocateJson,
  emptyInputError: "当前会话没有法官误判案例",
  modelLabel: "advocate",
};

// ---- createAdvocate (thin wrapper) ----

export function createAdvocate(config: Config): AdvocateFn {
  const analyzer = createRoleAnalyzer(config, advocateAnalyzerConfig);

  return async function analyze(
    cases: DeniedThenApproved[],
    cwd: string,
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
    getAuth: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >,
    currentJudgeMd: string,
    judgePrompt: string,
  ): Promise<AdvocateResult> {
    if (cases.length === 0) {
      return { error: "当前会话没有法官误判案例" };
    }

    const result = await analyzer(
      cases,
      cwd,
      currentJudgeMd,
      judgePrompt,
      resolveModel,
      getAuth,
    );

    return {
      suggestion: result.result,
      error: result.error,
      cost: result.cost,
    };
  };
}

// ---- createMerger (thin wrapper) ----

export function createMerger(config: Config): MergerFn {
  const sharedMerger = createSharedMerger(config);

  return async function merge(
    currentJudgeMd: string,
    selectedRules: string[],
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
    getAuth: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >,
  ): Promise<AdvocateResult> {
    const result = await sharedMerger(
      { current: currentJudgeMd, operations: selectedRules },
      resolveModel,
      getAuth,
    );
    return {
      mergedText: result.mergedText,
      error: result.error,
      cost: result.cost,
    };
  };
}

// ---- Prompt builder & JSON parser (role-specific, unchanged) ----

export function buildAdvocatePrompt(
  cases: DeniedThenApproved[],
  currentJudgeMd: string,
  judgePrompt: string,
  cwd: string,
): string {
  const caseList = cases
    .map((c, i) => {
      const contextStr =
        c.context.length > 0
          ? c.context
              .map((m) => `  [${m.role}] ${m.content.slice(0, 200)}`)
              .join("\n")
          : "  （无上下文）";
      return [
        `### 案例 ${i + 1}`,
        `- 工具: ${c.toolName}`,
        `- 命令: ${c.value}`,
        `- 法官理由: ${c.judgeReason}`,
        `- 对话上下文:`,
        contextStr,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "以下是我的权限系统（my-permission）中法官模型的误判案例。",
    "法官判了「不安全」，但用户随后批准了，说明这些操作实际上在项目环境中是安全的。",
    "",
    `当前项目工作目录: ${cwd}`,
    "",
    "---",
    "",
    "## 法官的原始判断提示词",
    "",
    "```",
    judgePrompt || "（法官提示词未加载）",
    "```",
    "",
    "---",
    "",
    "## 当前 JUDGE.md 内容",
    currentJudgeMd
      ? currentJudgeMd
          .split("\n")
          .map((line, i) => `${i + 1}. ${line}`)
          .join("\n")
      : "（空，尚未编写项目级判断规则）",
    "",
    "---",
    "",
    "## 误判案例",
    caseList,
  ].join("\n");
}

function parseAdvocateJson(text: string): AdvocateSuggestion | undefined {
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) return undefined;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const p = parsed as Record<string, unknown>;
    if (!Array.isArray(p.add) || !Array.isArray(p.remove)) {
      return undefined;
    }
    const add = (p.add as unknown[]).filter(
      (item): item is { rule: string; reason: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).rule === "string" &&
        typeof (item as Record<string, unknown>).reason === "string",
    );
    return {
      add,
      remove: (p.remove as unknown[]).filter(
        (v): v is string => typeof v === "string",
      ),
    };
  } catch {
    return undefined;
  }
}
