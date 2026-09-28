import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ANSI as C } from "../ansi";
import { type ChiefSuggestionItem, createChief } from "../chief";
import { appendCost } from "../cost-tracker";
import { loadFile } from "../file";
import { JUDGE_PROMPT } from "../judge-prompt";
import { mergeAndWrite } from "../merge";
import { auditBinding, createModelClient } from "../model-client";
import { suggestionTypeDetail, suggestionTypeLabel } from "../suggestion";

type ToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0];

export function createChiefTool(): ToolDefinition {
  return {
    name: "permission_chief",
    label: "审判长",
    description:
      "审计 JUDGE.md 规则本身的质量——发现矛盾、过宽、冗余、遗漏，输出 add/remove/modify/merge 建议。当用户提到审判长、规则审计、规则审查、规则矛盾、规则冲突、过宽规则时调用此工具。",
    promptSnippet: "permission_chief — 审计 JUDGE.md 规则质量，发现矛盾与盲区",
    parameters: Type.Object({
      instruction: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const instruction = (_params as { instruction?: string }).instruction;
      const currentJudgeMd = loadFile(join(process.cwd(), "JUDGE.md"));

      if (!currentJudgeMd?.trim()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "项目尚未创建 JUDGE.md，无需审计。",
            },
          ],
          details: {},
        };
      }

      const chief = createChief(createModelClient(ctx), auditBinding);

      const result = await chief(
        currentJudgeMd,
        JUDGE_PROMPT,
        ctx.cwd,
        instruction,
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `审判长分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined && result.modelUsed) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "chief-analysis",
          result.cost,
          result.modelUsed,
        );
      }

      const suggestion = result.suggestion;
      if (!suggestion || suggestion.suggestions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `审判长审计完成：${suggestion?.summary ?? "未发现问题"}`,
            },
          ],
          details: {},
        };
      }

      ctx.ui.notify(`👨‍⚖️ 审判长审计: ${suggestion.summary}`, "info");

      const selectedSuggestions: ChiefSuggestionItem[] = [];

      for (const item of suggestion.suggestions) {
        const label = suggestionTypeLabel(item.type);
        const detail = suggestionTypeDetail(item);
        const keep = await ctx.ui.confirm(
          `${C.cyan}👨‍⚖️ 审判长建议 — ${label}？${C.reset}`,
          detail,
        );
        if (keep) {
          selectedSuggestions.push(item);
        }
      }

      if (selectedSuggestions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "未采纳任何建议，JUDGE.md 未修改",
            },
          ],
          details: {},
        };
      }

      return await mergeAndWrite(ctx, {
        currentJudgeMd,
        operations: selectedSuggestions,
        analysisCost: result.cost,
        label: "审判长",
        emoji: "👨‍⚖️",
        costType: "chief-merge",
        count: selectedSuggestions.length,
        countLabel: "条操作",
      });
    },
  };
}
