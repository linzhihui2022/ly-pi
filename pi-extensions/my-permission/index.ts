import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { loadConfig } from "./config";
import { decide } from "./rules";
import { createJudge } from "./judge";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import { extractPathTokens } from "./utils";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));
  const runtime = await ModelRuntime.create();
  const judge = createJudge(runtime, config);
  const cache = createSessionCache();
  const child = isChildSession();

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    const value = stringifyToolInput(event);
    const rawPaths = collectPaths(toolName, value, event, ctx.cwd);
    const paths = resolveSymlinkedPaths(rawPaths, ctx.cwd);
    const verdict = decide({ toolName, value, paths }, ctx.cwd, config);

    if (verdict.action === "allow") return undefined;
    if (verdict.action === "deny") {
      return { block: true, reason: verdict.reason ?? `Blocked by ${verdict.source}` };
    }

    const cacheKey = `${toolName}:${value}`;
    if (cache.isApproved(cacheKey)) return undefined;

    const judgeResult = await judge({ toolName, value, paths }, ctx.cwd, ctx.model);
    if (judgeResult?.safe === true) return undefined;

    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult?.reason ?? "Denied in non-interactive or subagent session",
      };
    }

    const approved = await confirmToolCall(
      ctx,
      toolName,
      judgeResult?.toolFor ?? `${toolName} ${value}`,
      judgeResult?.reason ?? "No model judgment available",
    );

    if (approved) {
      cache.approve(cacheKey);
      return undefined;
    }
    return { block: true, reason: judgeResult?.reason ?? "User denied" };
  });
}

function stringifyToolInput(event: { toolName: string; input: Record<string, unknown> }): string {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }
  if (
    (event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") &&
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
      const full = p.startsWith("/") || p.startsWith("~")
        ? join(p.startsWith("~") ? process.env.HOME ?? "/home" : "/", p.replace(/^~/, ""))
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
