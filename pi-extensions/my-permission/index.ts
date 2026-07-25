import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import open from "open";
import {
  ensurePreviewServer,
  PREVIEW_DIR,
  stopPreviewServer,
} from "web-preview";
import { loadConfig } from "./config";
import { createJudge } from "./judge";
import { renderJudgeLogPage } from "./log-page";
import { decide } from "./rules";
import { collectJudgeLogs, recordJudgeStats } from "./stats";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import { extractPathTokens } from "./utils";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));
  const cache = createSessionCache();
  const child = isChildSession();

  pi.registerCommand("judge-log", {
    description: "查看当前会话的每一次法官判断",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const logs = collectJudgeLogs(ctx.sessionManager.getEntries());
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

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });

  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
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
