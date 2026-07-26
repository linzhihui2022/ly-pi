import type { Api, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import type { JudgeLogEntry } from "./stats";
import type { Config } from "./types";

export interface ProsecutorSuggestion {
  add: Array<{ rule: string; reason: string }>;
  summary: string;
}

export interface ProsecutorResult {
  suggestion?: ProsecutorSuggestion;
  error?: string;
}

export type ProsecutorFn = (
  allowedEntries: JudgeLogEntry[],
  cwd: string,
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  getAuth: (
    model: Model<Api>,
  ) => Promise<
    { apiKey?: string; headers?: Record<string, string> } | undefined
  >,
  currentJudgeMd: string,
  judgePrompt: string,
) => Promise<ProsecutorResult>;

export function createProsecutor(config: Config): ProsecutorFn {
  return async function analyze(
    allowedEntries: JudgeLogEntry[],
    cwd: string,
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
    getAuth: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >,
    currentJudgeMd: string,
    judgePrompt: string,
  ): Promise<ProsecutorResult> {
    if (allowedEntries.length === 0) {
      return { error: "当前会话没有法官放行的记录" };
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
        error: `未找到审查模型: ${config.professorModel}`,
      };
    }

    const prompt = buildProsecutorPrompt(
      allowedEntries,
      currentJudgeMd,
      judgePrompt,
      cwd,
    );
    const auth = await getAuth(model);

    try {
      const context = {
        systemPrompt: [
          "你是 my-permission 权限系统的安全审计员（检察官）。",
          "",
          "## 系统架构",
          "",
          "权限系统分两层：",
          "1. 规则层：模式匹配，直接 allow/deny",
          "2. 法官：LLM 判定者，对规则层未命中的操作做出 safe/unsafe 判定",
          "",
          "## 你的任务",
          "",
          "审计法官放行的所有操作，找出假阴性——即危险操作被法官误判为 safe 的情况。",
          "",
          "## 危险操作判定标准（意图链分析）",
          "",
          "不要只看工具名，要追踪工具调用的完整语义链：",
          "- 数据外泄：数据通过管道、重定向流向项目外部（curl、wget 等网络请求）",
          "- 不可逆副作用：删除文件（rm -rf）、修改系统配置（sudo、chmod 777）",
          "- 间接代码执行：-e/-c 参数传入代码、heredoc 管道给解释器",
          "- 不可信依赖：从外部 URL 安装包、未签名的 tgz/git 源",
          "",
          "## 输出格式",
          "",
          "只回复严格 JSON，不要包含其他文字：",
          "{",
          '  "add": [',
          '    { "rule": "新规则文本", "reason": "添加原因" }',
          "  ],",
          '  "summary": "一句话统计摘要"',
          "}",
          "",
          "add: 建议新增的安全规则（应 deny 或需要检察的模式），每条包含 rule（一行祈使句）和 reason（一句话原因）。如果没有假阴性，设为空数组 []。",
          "summary: 统计摘要，格式如 \"审查 X 条放行记录，发现 Y 条假阴性：管道外泄 N 次、heredoc 注入 M 次\"。如果没有假阴性，写\"未发现假阴性\"。",
          "",
          "关键：",
          "- 不要建议当前 JUDGE.md 中已覆盖的规则",
          "- 只报告确实危险的操作，正常安全操作不要误报",
          "- 如果所有操作都安全，add 为空数组",
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
        return { error: "审查模型返回了空内容" };
      }

      const parsed = parseProsecutorJson(text);
      if (!parsed) {
        return { error: "审查模型返回了无法解析的 JSON" };
      }
      return { suggestion: parsed };
    } catch (err) {
      return {
        error: `审查模型调用失败: ${(err as Error).message}`,
      };
    }
  };
}

function parseProsecutorJson(text: string): ProsecutorSuggestion | undefined {
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) return undefined;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const p = parsed as Record<string, unknown>;
    if (!Array.isArray(p.add) || typeof p.summary !== "string") {
      return undefined;
    }
    const add = (p.add as unknown[]).filter(
      (item): item is { rule: string; reason: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).rule === "string" &&
        typeof (item as Record<string, unknown>).reason === "string",
    );
    return { add, summary: p.summary };
  } catch {
    return undefined;
  }
}

export function buildProsecutorPrompt(
  allowedEntries: JudgeLogEntry[],
  currentJudgeMd: string,
  judgePrompt: string,
  cwd: string,
): string {
  const entryList = allowedEntries
    .map((e, i) => {
      return [
        `### 操作 ${i + 1}`,
        `- 工具: ${e.toolName}`,
        `- 命令: ${e.value}`,
        `- 法官判定: 安全 (score=${e.score ?? "?"})`,
        `- 法官理由: ${e.reason}`,
        `- 用途推断: ${e.toolFor}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "以下是我的权限系统（my-permission）中法官放行的所有操作。",
    "请审计这些操作，找出假阴性——即危险但被误判为安全的操作。",
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
    "## 被放行的操作（共 ${allowedEntries.length} 条）",
    entryList,
  ].join("\n");
}
