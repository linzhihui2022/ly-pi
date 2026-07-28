import type { Api, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import { createDevLogger } from "../my-log/index";
import type { Config } from "./types";

const log = createDevLogger("my-permission:chief");

// ---- types ----

export interface ChiefSuggestionItem {
  type: "add" | "remove" | "modify" | "merge";
  /** add: new rule text; remove: exact rule text to delete */
  rule?: string;
  /** modify: the current rule text to replace */
  oldRule?: string;
  /** modify / merge: the replacement rule text */
  newRule?: string;
  /** merge: multiple rule texts to merge into one */
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
}

export interface ChiefMergeResult {
  mergedText?: string;
  error?: string;
  cost?: number;
}

export type ChiefFn = (
  currentJudgeMd: string,
  judgePrompt: string,
  cwd: string,
  instruction?: string,
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  getAuth: (
    model: Model<Api>,
  ) => Promise<
    { apiKey?: string; headers?: Record<string, string> } | undefined
  >,
) => Promise<ChiefResult>;

export type ChiefMergerFn = (
  currentJudgeMd: string,
  selectedSuggestions: ChiefSuggestionItem[],
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  getAuth: (
    model: Model<Api>,
  ) => Promise<
    { apiKey?: string; headers?: Record<string, string> } | undefined
  >,
) => Promise<ChiefMergeResult>;

// ---- createChief ----

export function createChief(config: Config): ChiefFn {
  return async function analyze(
    currentJudgeMd: string,
    judgePrompt: string,
    cwd: string,
    instruction: string | undefined,
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
    getAuth: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >,
  ): Promise<ChiefResult> {
    if (!currentJudgeMd.trim()) {
      return { error: "项目尚未创建 JUDGE.md，无需审计" };
    }

    const parts = config.professorModel.split("/");
    if (parts.length !== 2) {
      return {
        error: `professorModel 格式无效: ${config.professorModel}`,
      };
    }

    const model = resolveModel(parts[0], parts[1]);
    if (!model) {
      log.error("chief model not found", { configured: config.professorModel });
      return { error: `未找到审判长模型: ${config.professorModel}` };
    }
    log.debug("chief model resolved", {
      provider: model.provider,
      model: model.id,
    });

    const prompt = buildChiefPrompt(
      currentJudgeMd,
      judgePrompt,
      cwd,
      instruction,
    );
    const auth = await getAuth(model);

    try {
      const context = {
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
        messages: [
          { role: "user" as const, content: prompt, timestamp: Date.now() },
        ],
      };

      const response = await complete(model, context, {
        thinking: config.professorThinking,
        apiKey: auth?.apiKey,
        headers: auth?.headers,
        env: auth?.env,
      });

      const cost = response.usage?.cost?.total;

      const errResp = response as Record<string, unknown>;
      if (errResp.stopReason === "error" || errResp.errorMessage) {
        log.error("chief API error", {
          detail: errResp.errorMessage || errResp.stopReason,
        });
        return {
          error: `审判长模型调用失败: ${errResp.errorMessage || errResp.stopReason}`,
        };
      }

      const text =
        response.content.find((c) => c.type === "text")?.text ||
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
        log.error("chief empty response");
        return { error: "审判长模型返回了空内容" };
      }

      const parsed = parseChiefJson(text);
      if (!parsed) {
        log.error("chief parse failed");
        return { error: "审判长模型返回了无法解析的 JSON" };
      }
      log.info("chief completed", {
        findings: parsed.suggestions.length,
        cost,
      });
      return { suggestion: parsed, cost };
    } catch (err) {
      log.error("chief call failed", { error: (err as Error).message });
      return { error: `审判长模型调用失败: ${(err as Error).message}` };
    }
  };
}

// ---- createChiefMerger ----

export function createChiefMerger(config: Config): ChiefMergerFn {
  return async function merge(
    currentJudgeMd: string,
    selectedSuggestions: ChiefSuggestionItem[],
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
    getAuth: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >,
  ): Promise<ChiefMergeResult> {
    const parts = config.professorModel.split("/");
    if (parts.length !== 2) {
      return { error: "professorModel 格式无效" };
    }

    const model = resolveModel(parts[0], parts[1]);
    if (!model) {
      log.error("chief merger model not found", {
        configured: config.professorModel,
      });
      return { error: "未找到审判长合并模型" };
    }

    const auth = await getAuth(model);

    const opsText = selectedSuggestions
      .map((s, i) => {
        switch (s.type) {
          case "add":
            return `${i + 1}. [新增] ${s.rule}\n   原因: ${s.reason}`;
          case "remove":
            return `${i + 1}. [删除] ${s.rule}\n   原因: ${s.reason}`;
          case "modify":
            return `${i + 1}. [改写] "${s.oldRule}" → "${s.newRule}"\n   原因: ${s.reason}`;
          case "merge":
            return `${i + 1}. [合并] ${(s.oldRules ?? []).map((r) => `"${r}"`).join(" + ")} → "${s.newRule}"\n   原因: ${s.reason}`;
          default:
            return `${i + 1}. [未知] ${JSON.stringify(s)}`;
        }
      })
      .join("\n\n");

    try {
      const context = {
        systemPrompt: [
          "你是 JUDGE.md 的编辑。将审判长的建议应用到现有的 JUDGE.md 中。",
          "",
          "操作类型：",
          "- [新增]：追加新规则到末尾或合适的位置",
          "- [删除]：移除完全匹配的规则行",
          "- [改写]：将 oldRule 替换为 newRule",
          "- [合并]：将多条 oldRules 替换为一条 newRule，删除原文，插入合并后的规则",
          "",
          "规则：",
          "- 保留所有未被操作的规则原文",
          "- 去除重复：如果操作结果与已有规则语义相同，跳过该操作",
          "- 保持简短精炼，一行一条",
          "- 直接输出完整的 JUDGE.md 文本，不要包含解释或 markdown 代码块",
        ].join("\n"),
        messages: [
          {
            role: "user" as const,
            content: [
              "现有 JUDGE.md：",
              currentJudgeMd || "（空）",
              "",
              "审判长的操作建议：",
              opsText,
              "",
              "请应用这些操作，直接输出完整的 JUDGE.md：",
            ].join("\n"),
            timestamp: Date.now(),
          },
        ],
      };

      const response = await complete(model, context, {
        apiKey: auth?.apiKey,
        headers: auth?.headers,
        env: auth?.env,
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
        log.error("chief merger empty response");
        return { error: "审判长合并模型返回了空内容" };
      }

      log.info("chief merger completed", {
        operations: selectedSuggestions.length,
        cost,
      });
      return { mergedText: text.trim(), cost };
    } catch (err) {
      log.error("chief merger call failed", { error: (err as Error).message });
      return { error: `审判长合并模型调用失败: ${(err as Error).message}` };
    }
  };
}

// ---- prompt builders ----

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

// ---- JSON parser ----

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
