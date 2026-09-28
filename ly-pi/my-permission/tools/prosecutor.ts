import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ANSI as C } from "../ansi";
import { appendCost } from "../cost-tracker";
import { loadFile } from "../file";
import { JUDGE_PROMPT } from "../judge-prompt";
import { mergeAndWrite } from "../merge";
import { auditBinding, createModelClient } from "../model-client";
import { createProsecutor } from "../prosecutor";
import { collectAllowed } from "../stats";

type ToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0];

export function createProsecutorTool(): ToolDefinition {
  return {
    name: "permission_prosecutor",
    label: "检察官",
    description:
      "审计法官放行的操作，发现假阴性（危险操作被误放行）并优化 JUDGE.md 规则。当用户提到检察官、假阴性、漏审、审计放行操作时调用此工具。",
    promptSnippet:
      "permission_prosecutor — 审计法官放行记录，发现假阴性并优化规则",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const allowed = collectAllowed(entries);

      if (allowed.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "当前会话没有法官放行的记录，无需审计。",
            },
          ],
          details: {},
        };
      }

      const prosecutor = createProsecutor(createModelClient(ctx), auditBinding);
      const currentJudgeMd = loadFile(join(process.cwd(), "JUDGE.md"));

      const result = await prosecutor(
        allowed,
        ctx.cwd,
        currentJudgeMd,
        JUDGE_PROMPT,
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `检察官分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined && result.modelUsed) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "prosecutor-analysis",
          result.cost,
          result.modelUsed,
        );
      }

      const suggestion = result.suggestion;
      if (!suggestion || suggestion.add.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `检察官审计完成：${suggestion?.summary ?? "未发现假阴性"}`,
            },
          ],
          details: {},
        };
      }

      ctx.ui.notify(`⚖️ 检察官审计: ${suggestion.summary}`, "info");

      const selectedRules: string[] = [];

      for (const item of suggestion.add) {
        const keep = await ctx.ui.confirm(
          `${C.cyan}⚖️ 检察官建议 — 采纳这条规则？${C.reset}`,
          `${C.bold}${item.rule}${C.reset}\n${C.yellow}原因: ${item.reason}${C.reset}`,
        );
        if (keep) {
          selectedRules.push(item.rule);
        }
      }

      if (selectedRules.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "未采纳任何规则，JUDGE.md 未修改",
            },
          ],
          details: {},
        };
      }

      return await mergeAndWrite(ctx, {
        currentJudgeMd,
        operations: selectedRules,
        analysisCost: result.cost,
        label: "检察官",
        emoji: "⚖️",
        costType: "prosecutor-merge",
        count: selectedRules.length,
        countLabel: "条规则",
      });
    },
  };
}
