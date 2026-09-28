import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ANSI as C } from "../ansi";
import { appendCost } from "../cost-tracker";
import { loadFile } from "../file";
import { JUDGE_PROMPT } from "../judge-prompt";
import { mergeAndWrite } from "../merge";
import { auditBinding, createModelClient } from "../model-client";
import { createAdvocate } from "../professor";
import { collectDeniedThenApproved } from "../stats";

type ToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0];

export function createAdvocateTool(): ToolDefinition {
  return {
    name: "permission_advocate",
    label: "辩护人",
    description:
      "分析法官误判案例（假阳性），交互式优化 JUDGE.md 规则。当用户提到辩护人、误判、假阳性、规则优化、JUDGE.md 相关操作时调用此工具。",
    promptSnippet: "permission_advocate — 交互式分析法官误判并优化 JUDGE.md",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const entries = ctx.sessionManager.getEntries();
      const cases = collectDeniedThenApproved(entries);

      if (cases.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "当前会话没有法官误判案例，法官表现完美！",
            },
          ],
          details: {},
        };
      }

      const advocate = createAdvocate(createModelClient(ctx), auditBinding);
      const currentJudgeMd = loadFile(join(process.cwd(), "JUDGE.md"));

      const result = await advocate(
        cases,
        ctx.cwd,
        currentJudgeMd,
        JUDGE_PROMPT,
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `辩护人分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined && result.modelUsed) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "advocate-analysis",
          result.cost,
          result.modelUsed,
        );
      }

      const suggestion = result.suggestion;
      if (
        !suggestion ||
        (suggestion.add.length === 0 && suggestion.remove.length === 0)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: "辩护人认为当前 JUDGE.md 已覆盖所有误判模式，无需修改",
            },
          ],
          details: {},
        };
      }

      const selectedRules: string[] = [];

      if (suggestion.remove.length > 0) {
        ctx.ui.notify(
          `💡 辩护人建议手动删除 ${suggestion.remove.length} 条过时规则（需手动处理）`,
          "info",
        );
      }

      for (const item of suggestion.add) {
        const keep = await ctx.ui.confirm(
          `${C.cyan}🎓 辩护人建议 — 采纳这条规则？${C.reset}`,
          `${C.bold}${item.rule}${C.reset}\n${C.yellow}原因: ${item.reason}${C.reset}`,
        );
        if (keep) {
          selectedRules.push(item.rule);
        }
      }

      if (selectedRules.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "未采纳任何规则，JUDGE.md 未修改" },
          ],
          details: {},
        };
      }

      // Phase 2: merge → write
      return await mergeAndWrite(ctx, {
        currentJudgeMd,
        operations: selectedRules,
        analysisCost: result.cost,
        label: "辩护人",
        emoji: "🎓",
        costType: "advocate-merge",
        count: selectedRules.length,
        countLabel: "条规则",
      });
    },
  };
}
