import type { Api, ModelsApiStreamOptions } from "@earendil-works/pi-ai";
import { createDevLogger } from "../my-log/index";
import type { ChiefSuggestionItem } from "./chief";
import { type DirectModelBinding, resolveDirectModel } from "./direct-model";
import type { ModelClient } from "./types";

const log = createDevLogger("my-permission:pipeline");

export interface AnalyzerConfig<TInput, TResult> {
  systemPrompt: string;
  buildUserPrompt: (
    input: TInput,
    cwd: string,
    currentJudgeMd: string,
    judgePrompt: string,
  ) => string;
  parseResult: (text: string) => TResult | undefined;
  emptyInputError: string;
  modelLabel: string;
}

export interface AnalyzerResult<TResult> {
  result?: TResult;
  error?: string;
  cost?: number;
  modelUsed?: string;
}

export type AnalyzerFn<TInput, TResult> = (
  input: TInput,
  cwd: string,
  currentJudgeMd: string,
  judgePrompt: string,
) => Promise<AnalyzerResult<TResult>>;

export interface MergerInput {
  current: string;
  operations: Array<string | ChiefSuggestionItem>;
}

export interface MergerResult {
  mergedText?: string;
  error?: string;
  cost?: number;
  modelUsed?: string;
}

export type MergerFn = (input: MergerInput) => Promise<MergerResult>;

function completeOptions(
  binding: DirectModelBinding,
): ModelsApiStreamOptions<Api> {
  return binding.thinking === undefined || binding.thinking === "off"
    ? {}
    : { reasoningEffort: binding.thinking };
}

export function createRoleAnalyzer<TInput, TResult>(
  roleConfig: AnalyzerConfig<TInput, TResult>,
  modelClient: ModelClient,
  binding: DirectModelBinding,
): AnalyzerFn<TInput, TResult> {
  return async function analyze(
    input: TInput,
    cwd: string,
    currentJudgeMd: string,
    judgePrompt: string,
  ): Promise<AnalyzerResult<TResult>> {
    if (Array.isArray(input) && input.length === 0) {
      return { error: roleConfig.emptyInputError };
    }

    const userPrompt = roleConfig.buildUserPrompt(
      input,
      cwd,
      currentJudgeMd,
      judgePrompt,
    );
    const context = {
      systemPrompt: roleConfig.systemPrompt,
      messages: [
        { role: "user" as const, content: userPrompt, timestamp: Date.now() },
      ],
    };

    try {
      const resolvedModel = resolveDirectModel(modelClient, binding);
      if (!resolvedModel) {
        log.error(`${roleConfig.modelLabel} model unavailable`, {
          model: binding.model,
        });
        return {
          error: `${roleConfig.modelLabel} 模型调用失败: 未找到可用的审计模型`,
        };
      }
      const response = await modelClient.complete(
        resolvedModel.model,
        context,
        completeOptions(binding),
      );
      if (response.stopReason !== "stop") {
        const reason = String(response.stopReason ?? "unknown");
        log.error(`${roleConfig.modelLabel} incomplete response`, { reason });
        return {
          error: `${roleConfig.modelLabel} 模型返回了非完整响应（${reason}）`,
        };
      }
      const cost = response.usage?.cost?.total;
      const text = extractResponseText(response);
      if (!text) {
        log.error(`${roleConfig.modelLabel} empty response`);
        return { error: `${roleConfig.modelLabel} 模型返回了空内容` };
      }

      const parsed = roleConfig.parseResult(text);
      if (!parsed) {
        log.error(`${roleConfig.modelLabel} parse failed`);
        return { error: `${roleConfig.modelLabel} 模型返回了无法解析的 JSON` };
      }

      log.info(`${roleConfig.modelLabel} completed`, {
        cost,
        model: resolvedModel.reference,
      });
      return { result: parsed, cost, modelUsed: resolvedModel.reference };
    } catch (err) {
      log.error(`${roleConfig.modelLabel} call failed`, {
        error: (err as Error).message,
      });
      return {
        error: `${roleConfig.modelLabel} 模型调用失败: ${(err as Error).message}`,
      };
    }
  };
}

export function createMerger(
  modelClient: ModelClient,
  binding: DirectModelBinding,
): MergerFn {
  return async function merge(input: MergerInput): Promise<MergerResult> {
    const isChief = input.operations.some((op) => typeof op !== "string");
    const { systemPrompt, userContent } = buildMergerPrompts(input, isChief);
    const context = {
      systemPrompt,
      messages: [
        {
          role: "user" as const,
          content: userContent,
          timestamp: Date.now(),
        },
      ],
    };

    try {
      const resolvedModel = resolveDirectModel(modelClient, binding);
      if (!resolvedModel) {
        log.error("merger model unavailable", { model: binding.model });
        return { error: "合并模型调用失败: 未找到可用的审计模型" };
      }
      const response = await modelClient.complete(
        resolvedModel.model,
        context,
        completeOptions(binding),
      );
      if (response.stopReason !== "stop") {
        const reason = String(response.stopReason ?? "unknown");
        log.error("merger incomplete response", { reason });
        return { error: `合并模型返回了非完整响应（${reason}）` };
      }
      const cost = response.usage?.cost?.total;
      const text = extractResponseText(response);
      if (!text) {
        log.error("merger empty response");
        return { error: "合并模型返回了空内容" };
      }

      log.info("merger completed", {
        operations: input.operations.length,
        cost,
        model: resolvedModel.reference,
      });
      return {
        mergedText: text.trim(),
        cost,
        modelUsed: resolvedModel.reference,
      };
    } catch (err) {
      log.error("merger call failed", { error: (err as Error).message });
      return {
        error: `合并模型调用失败: ${(err as Error).message}`,
      };
    }
  };
}

function extractResponseText(response: {
  content: Array<{ type: string; text?: string }>;
}): string | undefined {
  return (
    response.content.find((c) => c.type === "text")?.text ||
    response.content
      .flatMap((c) =>
        Object.entries(c as unknown as Record<string, unknown>)
          .filter(
            ([k, v]) => k !== "type" && typeof v === "string" && v.length > 0,
          )
          .map(([, v]) => v as string),
      )
      .join("")
  );
}

function buildMergerPrompts(
  input: MergerInput,
  isChief: boolean,
): { systemPrompt: string; userContent: string } {
  if (isChief) {
    const opsText = (input.operations as ChiefSuggestionItem[])
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

    return {
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
      userContent: [
        "现有 JUDGE.md：",
        input.current || "（空）",
        "",
        "审判长的操作建议：",
        opsText,
        "",
        "请应用这些操作，直接输出完整的 JUDGE.md：",
      ].join("\n"),
    };
  }

  const rulesList = (input.operations as string[])
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  return {
    systemPrompt: [
      "你是 JUDGE.md 的编辑。将用户选中的新规则融合到现有的 JUDGE.md 中。",
      "",
      "规则：",
      "- 保留现有 JUDGE.md 的所有有效内容，不要丢失任何条目",
      "- 将新规则追加到末尾，或插入到合适的位置",
      "- 去除重复：如果新规则和现有规则意思相同或被已有规则语义覆盖，只保留表述更清晰的那条，不要两者都保留",
      "- 如果新规则只是已有规则的特例（如已有「允许执行部署命令」，不要再保留「允许执行 bun run scripts/deploy.ts」），直接丢弃新规则",
      "- 保持简短精炼",
      "- 直接输出完整的 JUDGE.md 文本，不要包含解释或 markdown 代码块",
    ].join("\n"),
    userContent: [
      "现有 JUDGE.md：",
      input.current || "（空）",
      "",
      "用户选中的新规则：",
      rulesList,
      "",
      "请将它们融合，直接输出完整的 JUDGE.md：",
    ].join("\n"),
  };
}
