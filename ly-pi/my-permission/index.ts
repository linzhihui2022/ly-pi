import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { servePreviewFile, stopPreviewServer } from "../web-preview/preview";
import { config } from "./config";
import { renderCostPage } from "./cost-page";
import { aggregateCosts, appendCost } from "./cost-tracker";
import { loadFile } from "./file";
import { createJudge } from "./judge";
import { JUDGE_PROMPT } from "./judge-prompt";
import { renderJudgeLogPage } from "./log-page";
import { createModelClient } from "./model-client";
import { decide } from "./rules";
import { runPermissionSelfTest } from "./self-test";
import {
  collectJudgeLogs,
  recordJudgeStats,
  recordUserOverride,
} from "./stats";
import { createAdvocateTool } from "./tools/advocate";
import { createChiefTool } from "./tools/chief";
import { createProsecutorTool } from "./tools/prosecutor";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import {
  collectPaths,
  resolveSymlinkedPaths,
  stringifyToolInput,
} from "./utils";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const judgePrompt = JUDGE_PROMPT;
  const localJudge = loadFile(join(process.cwd(), "JUDGE.md"));
  const cache = createSessionCache();
  const child = isChildSession();

  pi.registerCommand("judge-log", {
    description: "查看当前会话的每一次法官判断",
    handler: async (_args, ctx: ExtensionContext) => {
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
  });

  pi.registerCommand("court-costs", {
    description: "查看累计的法庭四角色 LLM 成本统计",
    handler: async (_args, ctx: ExtensionContext) => {
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
  });

  pi.registerCommand("permission-self-test", {
    description: "使用法官模型运行权限对抗自测",
    handler: async (_args, ctx: ExtensionContext) => {
      const result = await runPermissionSelfTest({
        config,
        judgePrompt,
        localJudge,
        modelClient: createModelClient(ctx),
      });
      if (result.status === "failure") {
        ctx.ui.notify(`权限自测失败: ${result.error}`, "error");
        return;
      }

      ctx.ui.notify(result.report, "info");
    },
  });

  pi.registerTool(createAdvocateTool());
  pi.registerTool(createProsecutorTool());
  pi.registerTool(createChiefTool());

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });

  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      judgePrompt,
      localJudge,
      modelClient: createModelClient(ctx),
    });
    const toolName = event.toolName;
    const value = stringifyToolInput(event);
    const rawPaths = collectPaths(toolName, value, event, ctx.cwd);
    const paths = resolveSymlinkedPaths(rawPaths, ctx.cwd);
    const verdict = decide({ toolName, value, paths }, ctx.cwd, config);

    if (verdict.action === "allow") return undefined;
    if (verdict.action === "deny") {
      return {
        block: true,
        reason: verdict.reason ?? `Blocked by ${verdict.source}`,
      };
    }

    const cacheKey = `${toolName}:${value}`;
    if (cache.isApproved(cacheKey)) return undefined;

    const judgeResult = await judge({ toolName, value, paths }, ctx.cwd);
    recordJudgeStats(pi, { toolName, value }, judgeResult);
    if (judgeResult.cost !== undefined && judgeResult.modelUsed) {
      appendCost(
        ctx.sessionManager.getSessionId(),
        ctx.cwd,
        "judge",
        judgeResult.cost,
        judgeResult.modelUsed,
      );
    }
    if (judgeResult.safe === true) return undefined;

    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult.reason,
      };
    }

    const approved = await confirmToolCall(ctx, {
      toolName,
      modelUsed: judgeResult.modelUsed,
      toolFor: judgeResult.toolFor,
      reason: judgeResult.reason,
      score: judgeResult.score,
      value,
      cwd: ctx.cwd,
      paths,
    });

    if (approved) {
      cache.approve(cacheKey);
      recordUserOverride(pi, { toolName, value, paths });
      return undefined;
    }
    return { block: true, reason: `User denied: ${judgeResult.reason}` };
  });
}
