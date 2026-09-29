import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { servePreviewFile } from "../web-preview/preview";
import { config } from "./config";
import { renderCostPage } from "./cost-page";
import { aggregateCosts } from "./cost-tracker";
import { renderJudgeLogPage } from "./log-page";
import { createModelClient } from "./model-client";
import { runPermissionSelfTest } from "./self-test";
import { collectJudgeLogs } from "./stats";

type CommandDefinition = Parameters<ExtensionAPI["registerCommand"]>[1];

export function createJudgeLogCommand(): CommandDefinition {
  return {
    description: "查看当前会话的每一次法官判断",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const entries = ctx.sessionManager.getEntries();
      const logs = collectJudgeLogs(entries);
      if (logs.length === 0) {
        ctx.ui.notify("当前会话暂无法官判断", "info");
        return;
      }

      try {
        const sessionId = ctx.sessionManager.getSessionId();
        const fileUrl = await servePreviewFile(
          sessionId,
          "judge-log.html",
          renderJudgeLogPage(logs),
        );
        ctx.ui.notify(`Preview: ${fileUrl}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to start preview server: ${(err as Error).message}`,
          "error",
        );
      }
    },
  };
}

export function createCourtCostsCommand(): CommandDefinition {
  return {
    description: "查看累计的法庭四角色 LLM 成本统计",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const agg = aggregateCosts(ctx.cwd);

      try {
        const sessionId = ctx.sessionManager.getSessionId();
        const fileUrl = await servePreviewFile(
          sessionId,
          "court-costs.html",
          renderCostPage(agg),
        );
        ctx.ui.notify(`Preview: ${fileUrl}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Failed to start preview server: ${(err as Error).message}`,
          "error",
        );
      }
    },
  };
}

export function createSelfTestCommand(deps: {
  judgePrompt: string;
  localJudge: string;
}): CommandDefinition {
  return {
    description: "使用法官模型运行权限对抗自测",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const result = await runPermissionSelfTest({
        config,
        judgePrompt: deps.judgePrompt,
        localJudge: deps.localJudge,
        modelClient: createModelClient(ctx),
      });
      if (result.status === "failure") {
        ctx.ui.notify(`权限自测失败: ${result.error}`, "error");
        return;
      }

      ctx.ui.notify(result.report, "info");
    },
  };
}
