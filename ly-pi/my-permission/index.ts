import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ANSI as C } from "../src/shared/ansi";
import {
  createAuthResolver,
  createAuthResolverWithFallback,
} from "../src/shared/auth";
import { loadFile } from "../src/shared/file";
import { servePreviewFile, stopPreviewServer } from "../src/shared/preview";
import type { ChiefSuggestionItem } from "./chief";
import { createChief } from "./chief";
import { config } from "./config";
import { createMerger as createPipelineMerger } from "./pipeline";
import { JUDGE_PROMPT } from "./judge-prompt";
import { renderCostPage } from "./cost-page";
import { aggregateCosts, appendCost } from "./cost-tracker";
import { createJudge } from "./judge";
import { renderJudgeLogPage } from "./log-page";
import { createAdvocate } from "./professor";
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
  resolveSymlinkedPaths,
  stringifyToolInput,
} from "./utils";

// ---- diff helpers ----

const GREY = "\x1b[90m";

interface DiffLine {
  type: "keep" | "add" | "remove";
  text: string;
}

/** Compute line-level diff between old and new text using LCS. */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "keep", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

/** Format diff as color-coded text for confirm dialog body. */
function formatDiff(oldText: string, newText: string): string {
  const diff = computeDiff(oldText, newText);
  const adds = diff.filter((d) => d.type === "add").length;
  const removes = diff.filter((d) => d.type === "remove").length;

  const lines: string[] = [];
  lines.push(
    `${C.bold}变更预览 (${adds + removes} 处: ${C.green}+${adds}${C.reset}${C.bold} ${C.red}−${removes}${C.reset}${C.bold})${C.reset}`,
  );
  lines.push("");

  for (const d of diff) {
    if (d.type === "keep") {
      lines.push(`${GREY}  ${d.text}${C.reset}`);
    } else if (d.type === "add") {
      lines.push(`${C.green}+ ${d.text}${C.reset}`);
    } else {
      lines.push(`${C.red}− ${d.text}${C.reset}`);
    }
  }

  return lines.join("\n");
}

/** Format chief suggestion type for confirm dialog label. */
function suggestionTypeLabel(type: string): string {
  switch (type) {
    case "add":
      return "新增规则";
    case "remove":
      return "删除规则";
    case "modify":
      return "改写规则";
    case "merge":
      return "合并规则";
    default:
      return type;
  }
}

/** Format chief suggestion detail for confirm dialog body. */
function suggestionTypeDetail(item: {
  type: string;
  rule?: string;
  oldRule?: string;
  newRule?: string;
  oldRules?: string[];
  reason: string;
}): string {
  const parts: string[] = [];
  switch (item.type) {
    case "add":
      parts.push(`${C.bold}新增: ${item.rule}${C.reset}`);
      break;
    case "remove":
      parts.push(`${C.bold}删除: ${item.rule}${C.reset}`);
      break;
    case "modify":
      parts.push(`${C.bold}改写${C.reset}`);
      parts.push(`${C.red}− ${item.oldRule}${C.reset}`);
      parts.push(`${C.green}+ ${item.newRule}${C.reset}`);
      break;
    case "merge":
      parts.push(`${C.bold}合并${C.reset}`);
      for (const r of item.oldRules ?? []) {
        parts.push(`${C.red}− ${r}${C.reset}`);
      }
      parts.push(`${C.green}+ ${item.newRule}${C.reset}`);
      break;
  }
  parts.push(`${C.yellow}原因: ${item.reason}${C.reset}`);
  return parts.join("\n");
}

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const judgePrompt = JUDGE_PROMPT;
  const localJudge = loadFile(join(process.cwd(), "JUDGE.md"));
  const cache = createSessionCache();
  const child = isChildSession();

  /** Shared Phase 2: merge selected operations → confirm → write JUDGE.md */
  async function mergeAndWrite(
    ctx: ExtensionContext,
    opts: {
      currentJudgeMd: string;
      operations: Array<string | ChiefSuggestionItem>;
      resolveModel: (provider: string, id: string) => Model<Api> | undefined;
      analysisCost?: number;
      label: string;
      emoji: string;
      costType: "advocate-merge" | "prosecutor-merge" | "chief-merge";
      count: number;
      countLabel: string;
    },
  ) {
    const merger = createPipelineMerger(config);
    const mergeResult = await merger(
      { current: opts.currentJudgeMd, operations: opts.operations },
      opts.resolveModel,
      createAuthResolverWithFallback(
        ctx.modelRegistry.getApiKeyAndHeaders,
        (p) => ctx.modelRegistry.getApiKeyForProvider(p),
      ),
    );

    if (mergeResult.error || !mergeResult.mergedText) {
      return {
        content: [
          {
            type: "text" as const,
            text: `融合失败: ${mergeResult.error || "空内容"}`,
          },
        ],
        details: {},
      };
    }

    if (mergeResult.cost !== undefined) {
      appendCost(
        ctx.sessionManager.getSessionId(),
        ctx.cwd,
        opts.costType,
        mergeResult.cost,
        config.professorModel,
      );
    }

    const totalCost = (opts.analysisCost ?? 0) + (mergeResult.cost ?? 0);
    ctx.ui.notify(
      `${opts.emoji} ${opts.label}费用: $${totalCost.toFixed(6)} (分析 $${(opts.analysisCost ?? 0).toFixed(6)} + 合并 $${(mergeResult.cost ?? 0).toFixed(6)})`,
      "info",
    );

    const diffBody = formatDiff(opts.currentJudgeMd, mergeResult.mergedText);
    const write = await ctx.ui.confirm(
      `${opts.emoji} ${opts.label}融合完成 — 确认写入？`,
      diffBody,
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
            type: "text" as const,
            text: `✅ JUDGE.md 已更新，共 ${opts.count} ${opts.countLabel}`,
          },
        ],
        details: {},
      };
    }

    return {
      content: [{ type: "text" as const, text: "已放弃，JUDGE.md 未修改" }],
      details: {},
    };
  }

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
            {
              type: "text" as const,
              text: "当前会话没有法官误判案例，法官表现完美！",
            },
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
        createAuthResolverWithFallback(
          ctx.modelRegistry.getApiKeyAndHeaders,
          (p) => ctx.modelRegistry.getApiKeyForProvider(p),
        ),
        currentJudgeMd,
        judgePrompt,
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `辩护人分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "advocate-analysis",
          result.cost,
          config.professorModel,
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
        resolveModel,
        analysisCost: result.cost,
        label: "辩护人",
        emoji: "🎓",
        costType: "advocate-merge",
        count: selectedRules.length,
        countLabel: "条规则",
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
              type: "text" as const,
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
        createAuthResolverWithFallback(
          ctx.modelRegistry.getApiKeyAndHeaders,
          (p) => ctx.modelRegistry.getApiKeyForProvider(p),
        ),
        currentJudgeMd,
        judgePrompt,
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `检察官分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "prosecutor-analysis",
          result.cost,
          config.professorModel,
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
        resolveModel,
        analysisCost: result.cost,
        label: "检察官",
        emoji: "⚖️",
        costType: "prosecutor-merge",
        count: selectedRules.length,
        countLabel: "条规则",
      });
    },
  });

  pi.registerTool({
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

      const resolveModel = (provider: string, id: string) =>
        ctx.modelRegistry.find(provider, id);
      const chief = createChief(config);

      const result = await chief(
        currentJudgeMd,
        judgePrompt,
        ctx.cwd,
        instruction,
        resolveModel,
        createAuthResolverWithFallback(
          ctx.modelRegistry.getApiKeyAndHeaders,
          (p) => ctx.modelRegistry.getApiKeyForProvider(p),
        ),
      );

      if (result.error) {
        return {
          content: [
            { type: "text" as const, text: `审判长分析失败: ${result.error}` },
          ],
          details: {},
        };
      }

      if (result.cost !== undefined) {
        appendCost(
          ctx.sessionManager.getSessionId(),
          ctx.cwd,
          "chief-analysis",
          result.cost,
          config.professorModel,
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
        resolveModel,
        analysisCost: result.cost,
        label: "审判长",
        emoji: "👨‍⚖️",
        costType: "chief-merge",
        count: selectedSuggestions.length,
        countLabel: "条操作",
      });
    },
  });

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });

  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      judgePrompt,
      localJudge,
      getAuth: async (model) => {
        const standard = createAuthResolver(
          ctx.modelRegistry.getApiKeyAndHeaders,
        );
        const result = await standard(model);
        if (result?.apiKey) return result;
        // Fallback: get API key directly from provider credential store
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider(
          model.provider,
        );
        if (apiKey) return { apiKey };
        return result;
      },
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
