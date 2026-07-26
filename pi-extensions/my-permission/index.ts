import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import open from "open";
import {
  ensurePreviewServer,
  PREVIEW_DIR,
  stopPreviewServer,
} from "web-preview";
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
import { extractPathTokens } from "./utils";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};
export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));

  const judgePrompt = loadPrompt(extensionDir);
  const localJudge = loadFile(join(process.cwd(), "JUDGE.md"));
  const cache = createSessionCache();
  const child = isChildSession();

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
        const sessionDir = join(PREVIEW_DIR, sessionId);
        mkdirSync(sessionDir, { recursive: true });
        writeFileSync(
          join(sessionDir, "judge-log.html"),
          renderJudgeLogPage(logs),
          "utf-8",
        );

        const server = await ensurePreviewServer({
          host: "127.0.0.1",
          urlHost: "localhost",
          port: 3456,
        });

        const fileUrl = `${server.url}/${sessionId}/judge-log.html`;
        open(fileUrl).catch(() => {
          // Browser open failures are non-fatal
        });
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
        typeof ctx.modelRegistry.getApiKeyAndHeaders === "function"
          ? async (model: Model<Api>) => {
              const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
              return auth.ok ? auth : undefined;
            }
          : async () => undefined,
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

      // Phase 2: merge

      const merger = createMerger(config);
      const mergeResult = await merger(
        currentJudgeMd,
        selectedRules,
        resolveModel,
        typeof ctx.modelRegistry.getApiKeyAndHeaders === "function"
          ? async (model) => {
              const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
              return auth.ok ? auth : undefined;
            }
          : async () => undefined,
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

      const totalCost = (result.cost ?? 0) + (mergeResult.cost ?? 0);
      ctx.ui.notify(
        `🎓 辩护人费用: $${totalCost.toFixed(6)} (分析 $${(result.cost ?? 0).toFixed(6)} + 合并 $${(mergeResult.cost ?? 0).toFixed(6)})`,
        "info",
      );

      const write = await ctx.ui.confirm(
        `🎓 辩护人融合完成 — 确认写入？`,
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
              text: `✅ JUDGE.md 已更新，共 ${selectedRules.length} 条规则`,
            },
          ],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: "已放弃，JUDGE.md 未修改" }],
        details: {},
      };
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
        typeof ctx.modelRegistry.getApiKeyAndHeaders === "function"
          ? async (model: Model<Api>) => {
              const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
              return auth.ok ? auth : undefined;
            }
          : async () => undefined,
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

      const merger = createMerger(config);
      const mergeResult = await merger(
        currentJudgeMd,
        selectedRules,
        resolveModel,
        typeof ctx.modelRegistry.getApiKeyAndHeaders === "function"
          ? async (model: Model<Api>) => {
              const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
              return auth.ok ? auth : undefined;
            }
          : async () => undefined,
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

      const totalCost = (result.cost ?? 0) + (mergeResult.cost ?? 0);
      ctx.ui.notify(
        `⚖️ 检察官费用: $${totalCost.toFixed(6)} (分析 $${(result.cost ?? 0).toFixed(6)} + 合并 $${(mergeResult.cost ?? 0).toFixed(6)})`,
        "info",
      );

      const write = await ctx.ui.confirm(
        `⚖️ 检察官融合完成 — 确认写入？`,
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
              text: `✅ JUDGE.md 已更新，共 ${selectedRules.length} 条规则`,
            },
          ],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: "已放弃，JUDGE.md 未修改" }],
        details: {},
      };
    },
  });

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });

  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      judgePrompt,
      localJudge,
      getAuth:
        typeof ctx.modelRegistry.getApiKeyAndHeaders === "function"
          ? async (model) => {
              const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
              return auth.ok ? auth : undefined;
            }
          : undefined,
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

function stringifyToolInput(event: {
  toolName: string;
  input: Record<string, unknown>;
}): string {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }
  if (
    (event.toolName === "read" ||
      event.toolName === "write" ||
      event.toolName === "edit") &&
    typeof event.input.path === "string"
  ) {
    return event.input.path;
  }
  return JSON.stringify(event.input);
}

function collectPaths(
  toolName: string,
  value: string,
  event: { toolName: string; input: Record<string, unknown> },
  cwd: string,
): string[] {
  if (toolName === "bash") return extractPathTokens(value, cwd);
  if (
    toolName === "read" ||
    toolName === "write" ||
    toolName === "edit" ||
    toolName === "ls"
  ) {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  if (toolName === "grep" || toolName === "find") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  return [];
}

function resolveSymlinkedPaths(paths: string[], cwd: string): string[] {
  const resolved = [...paths];
  for (const p of paths) {
    try {
      const full =
        p.startsWith("/") || p.startsWith("~")
          ? join(
              p.startsWith("~") ? (process.env.HOME ?? "/home") : "/",
              p.replace(/^~/, ""),
            )
          : join(cwd, p);
      const real = realpathSync(full);
      if (real !== full) {
        resolved.push(real);
      }
    } catch {
      // symlink resolution failed (e.g. file doesn't exist), skip
    }
  }
  return resolved;
}

function loadPrompt(extensionDir: string): string {
  const prompt = loadFile(join(extensionDir, "judge-prompt.md"));
  if (!prompt) {
    console.warn(
      "[my-permission] judge-prompt.md not found, judge will be disabled",
    );
  }
  return prompt;
}

function loadFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}
