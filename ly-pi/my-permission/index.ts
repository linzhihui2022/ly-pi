import { join } from "node:path";
import { writeFileSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ANSI as C } from "../src/shared/ansi";
import { createAuthResolver } from "../src/shared/auth";
import { resolveExtDir } from "../src/shared/ext-dir";
import { loadFile } from "../src/shared/file";
import {
  servePreviewFile,
} from "../src/shared/preview";
import { loadConfig } from "./config";
import { createJudge } from "./judge";
import { renderJudgeLogPage } from "./log-page";
import { createAdvocate, createMerger } from "./professor";
import { createProsecutor } from "./prosecutor";
import { decide } from "./rules";
import {
  collectAllowed,
  collectDeniedThenApproved,
  collectJudgeLogs,
  recordJudgeStats,
  recordUserOverride,
} from "./stats";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import {
  collectPaths,
  extractPathTokens,
  resolveSymlinkedPaths,
  stringifyToolInput,
} from "./utils";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const extensionDir = resolveExtDir(import.meta);
  const config = await loadConfig(join(extensionDir, "config.json"));

  const judgePrompt = (() => {
    const prompt = loadFile(join(extensionDir, "judge-prompt.md"));
    if (!prompt) {
      console.warn(
        "[my-permission] judge-prompt.md not found, judge will be disabled",
      );
    }
    return prompt;
  })();
  const localJudge = loadFile(join(process.cwd(), "JUDGE.md"));
  const cache = createSessionCache();
  const child = isChildSession();

  /** Shared Phase 2: merge selected rules → confirm → write JUDGE.md */
  async function mergeAndWriteJudgeMd(ctx: ExtensionCommandContext, opts: {
    currentJudgeMd: string;
    selectedRules: string[];
    resolveModel: (provider: string, id: string) => Model<Api> | undefined;
    analysisCost?: number;
    label: string;
    emoji: string;
  }) {
    const merger = createMerger(config);
    const mergeResult = await merger(
      opts.currentJudgeMd,
      opts.selectedRules,
      opts.resolveModel,
      createAuthResolver(ctx.modelRegistry.getApiKeyAndHeaders),
    );

    if (mergeResult.error || !mergeResult.mergedText) {
      return {
        content: [
          {
            type: "text",
            text: `融合失败: ${mergeResult.error || "空内容"}`,
          },
        ],
        details: {},
      };
    }

    const totalCost = (opts.analysisCost ?? 0) + (mergeResult.cost ?? 0);
    ctx.ui.notify(
      `${opts.emoji} ${opts.label}费用: $${totalCost.toFixed(6)} (分析 $${(opts.analysisCost ?? 0).toFixed(6)} + 合并 $${(mergeResult.cost ?? 0).toFixed(6)})`,
      "info",
    );

    const write = await ctx.ui.confirm(
      `${opts.emoji} ${opts.label}融合完成 — 确认写入？`,
      `${C.green}${mergeResult.mergedText}${C.reset}`,
    );

    if (write) {
      writeFileSync(
        join(process.cwd(), "JUDGE.md"),
        mergeResult.mergedText,
        "utf-8",
      );
      return {
        content: [
          {
            type: "text",
            text: `✅ JUDGE.md 已更新，共 ${opts.selectedRules.length} 条规则`,
          },
        ],
        details: {},
      };
    }

    return {
      content: [{ type: "text", text: "已放弃，JUDGE.md 未修改" }],
      details: {},
    };
  }

  pi.registerCommand("judge-log", {
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
  });

  pi.registerTool({
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
            { type: "text", text: "当前会话没有法官误判案例，法官表现完美！" },
          ],
          details: {},
        };
      }

      const resolveModel = (provider: string, id: string) =>
        ctx.modelRegistry.find(provider, id);
      const advocate = createAdvocate(config);
      const currentJudgeMd = loadFile(join(process.cwd(), "JUDGE.md"));

      const result = await advocate(
        cases,
        ctx.cwd,
        resolveModel,
        createAuthResolver(ctx.modelRegistry.getApiKeyAndHeaders),
        currentJudgeMd,
        judgePrompt,
      );

      if (result.error) {
        return {
          content: [{ type: "text", text: `辩护人分析失败: ${result.error}` }],
          details: {},
        };
      }

      const suggestion = result.suggestion;
      if (
        !suggestion ||
        (suggestion.add.length === 0 && suggestion.remove.length === 0)
      ) {
        return {
          content: [
            {
              type: "text",
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
          content: [{ type: "text", text: "未采纳任何规则，JUDGE.md 未修改" }],
          details: {},
        };
      }

      // Phase 2: merge → write
      return await mergeAndWriteJudgeMd(ctx, {
        currentJudgeMd,
        selectedRules,
        resolveModel,
        analysisCost: result.cost,
        label: "辩护人",
        emoji: "🎓",
      });
    },
  });

  pi.registerTool({
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
              type: "text",
              text: "当前会话没有法官放行的记录，无需审计。",
            },
          ],
          details: {},
        };
      }

      const resolveModel = (provider: string, id: string) =>
        ctx.modelRegistry.find(provider, id);
      const prosecutor = createProsecutor(config);
      const currentJudgeMd = loadFile(join(process.cwd(), "JUDGE.md"));

      const result = await prosecutor(
        allowed,
        ctx.cwd,
        resolveModel,
        createAuthResolver(ctx.modelRegistry.getApiKeyAndHeaders),
        currentJudgeMd,
        judgePrompt,
      );

      if (result.error) {
        return {
          content: [{ type: "text", text: `检察官分析失败: ${result.error}` }],
          details: {},
        };
      }

      const suggestion = result.suggestion;
      if (!suggestion || suggestion.add.length === 0) {
        return {
          content: [
            {
              type: "text",
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
              type: "text",
              text: "未采纳任何规则，JUDGE.md 未修改",
            },
          ],
          details: {},
        };
      }

      return await mergeAndWriteJudgeMd(ctx, {
        currentJudgeMd,
        selectedRules,
        resolveModel,
        analysisCost: result.cost,
        label: "检察官",
        emoji: "⚖️",
      });
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      judgePrompt,
      localJudge,
      getAuth: createAuthResolver(ctx.modelRegistry.getApiKeyAndHeaders),
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

    const resolveModel = (provider: string, id: string) =>
      ctx.modelRegistry.find(provider, id);
    const judgeResult = await judge(
      { toolName, value, paths },
      ctx.cwd,
      ctx.model,
      resolveModel,
    );
    recordJudgeStats(pi, { toolName, value }, judgeResult);
    if (judgeResult.safe === true) return undefined;

    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult.reason,
      };
    }

    const approved = await confirmToolCall(ctx, {
      toolName,
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
