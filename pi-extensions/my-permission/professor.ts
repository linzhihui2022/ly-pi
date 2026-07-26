import type { Api, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
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
  /** Total cost in USD (analysis + merge calls). */
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

export function createAdvocate(config: Config): AdvocateFn {
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

    const parts = config.professorModel.split("/");
    if (parts.length !== 2) {
      return {
        error: `professorModel 格式无效: ${config.professorModel}，需要 provider/model 格式`,
      };
    }

    const model = resolveModel(parts[0], parts[1]);
    if (!model) {
      return {
        error: `未找到教授模型: ${config.professorModel}`,
      };
    }

    const prompt = buildAdvocatePrompt(cases, currentJudgeMd, judgePrompt, cwd);
    const auth = await getAuth(model);

    try {
      const context = {
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
        messages: [
          { role: "user" as const, content: prompt, timestamp: Date.now() },
        ],
      };

      const response = await complete(model, context, {
        thinking: config.professorThinking,
        apiKey: auth?.apiKey,
        headers: auth?.headers,
      });

      const cost = response.usage?.cost?.total;

      const text =
        response.content.find((c) => c.type === "text")?.text ??
        response.content
          .flatMap((c) =>
            Object.entries(c as unknown as Record<string, unknown>)
              .filter(
                ([k, v]) =>
                  k !== "type" && typeof v === "string" && v.length > 0,
              )
              .map(([, v]) => v as string),
          )
          .join("");

      if (!text) {
        return { error: "教授模型返回了空内容" };
      }

      const parsed = parseAdvocateJson(text);
      if (!parsed) {
        return { error: "教授模型返回了无法解析的 JSON" };
      }
      return { suggestion: parsed, cost };
    } catch (err) {
      return {
        error: `教授模型调用失败: ${(err as Error).message}`,
      };
    }
  };
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

export function createMerger(config: Config): MergerFn {
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
    const parts = config.professorModel.split("/");
    if (parts.length !== 2) {
      return { error: `professorModel 格式无效` };
    }

    const model = resolveModel(parts[0], parts[1]);
    if (!model) {
      return { error: `未找到教授模型` };
    }

    const auth = await getAuth(model);
    const rulesList = selectedRules.map((r, i) => `${i + 1}. ${r}`).join("\n");

    try {
      const context = {
        systemPrompt: [
          "你是 JUDGE.md 的编辑。将用户选中的新规则融合到现有的 JUDGE.md 中。",
          "",
          "规则：",
          "- 保留现有 JUDGE.md 的所有有效内容，不要丢失任何条目",
          "- 将新规则追加到末尾，或插入到合适的位置",
          "- 去除重复：如果新规则和现有规则意思相同或被已有规则语义覆盖，只保留表述更清晰的那条，不要两者都保留",
          "- 如果新规则只是已有规则的特例（如已有「允许执行部署命令」，不要再保留「允许执行 bun run scripts/deploy.ts」），直接丢弃新规则",
          undefined,
          "- 保持简短精炼",
          "- 直接输出完整的 JUDGE.md 文本，不要包含解释或 markdown 代码块",
        ].join("\n"),
        messages: [
          {
            role: "user" as const,
            content: [
              "现有 JUDGE.md：",
              currentJudgeMd || "（空）",
              "",
              "用户选中的新规则：",
              rulesList,
              "",
              "请将它们融合，直接输出完整的 JUDGE.md：",
            ].join("\n"),
            timestamp: Date.now(),
          },
        ],
      };

      const response = await complete(model, context, {
        apiKey: auth?.apiKey,
        headers: auth?.headers,
      });

      const cost = response.usage?.cost?.total;

      const text =
        response.content.find((c) => c.type === "text")?.text ??
        response.content
          .flatMap((c) =>
            Object.entries(c as unknown as Record<string, unknown>)
              .filter(
                ([k, v]) =>
                  k !== "type" && typeof v === "string" && v.length > 0,
              )
              .map(([, v]) => v as string),
          )
          .join("");

      if (!text) {
        return { error: "融合模型返回了空内容" };
      }

      return { mergedText: text.trim(), cost };
    } catch (err) {
      return { error: `融合模型调用失败: ${(err as Error).message}` };
    }
  };
}
