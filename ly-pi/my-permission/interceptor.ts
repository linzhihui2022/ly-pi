import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { config } from "./config";
import { appendCost } from "./cost-tracker";
import { createJudge } from "./judge";
import { createModelClient } from "./model-client";
import { decide } from "./rules";
import { recordJudgeStats, recordUserOverride } from "./stats";
import { confirmToolCall, type createSessionCache } from "./ui";
import {
  collectPaths,
  resolveSymlinkedPaths,
  stringifyToolInput,
} from "./utils";

export interface ToolCallInterceptorDeps {
  pi: ExtensionAPI;
  judgePrompt: string;
  localJudge: string;
  cache: ReturnType<typeof createSessionCache>;
  child: boolean;
}

export function createToolCallInterceptor(deps: ToolCallInterceptorDeps) {
  const { pi, judgePrompt, localJudge, cache, child } = deps;

  return async (
    event: ToolCallEvent,
    ctx: ExtensionContext,
  ): Promise<ToolCallEventResult | undefined> => {
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
  };
}
