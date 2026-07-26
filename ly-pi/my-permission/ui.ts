import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ANSI, style as styled } from "../src/shared/ansi";

function label(text: string): string {
  return styled(text, ANSI.bold);
}

function value(text: string): string {
  return styled(text, ANSI.cyan);
}

function scoreStyle(score: number): string {
  if (score <= 3) return ANSI.red;
  if (score <= 6) return ANSI.yellow;
  return ANSI.green;
}

export function isChildSession(): boolean {
  return !!process.env.PI_SUBAGENT_PARENT_SESSION;
}

export function createSessionCache() {
  const approved = new Set<string>();
  return {
    approve(key: string) {
      approved.add(key);
    },
    isApproved(key: string) {
      return approved.has(key);
    },
  };
}

export async function confirmToolCall(
  ctx: ExtensionContext,
  options: {
    toolName: string;
    toolFor: string;
    reason: string;
    score?: number;
    value: string;
    cwd: string;
    paths: string[];
  },
): Promise<boolean> {
  if (!ctx.hasUI) return false;
  const { title, body } = formatConfirmMessage(options);
  return await ctx.ui.confirm(title, body);
}

export function formatConfirmMessage(options: {
  toolName: string;
  toolFor: string;
  reason: string;
  score?: number;
  value: string;
  cwd: string;
  paths: string[];
}): { title: string; body: string } {
  const lines = [
    `${label("工具：")}${value(options.toolName)}`,
    `${label("操作：")}${styled(options.toolFor, ANSI.yellow)}`,
    `${label("输入：")}${value(options.value)}`,
    `${label("工作目录：")}${value(options.cwd)}`,
  ];
  if (options.paths.length > 0) {
    lines.push(`${label("涉及路径：")}${value(options.paths.join(", "))}`);
  }
  const scoreText =
    options.score !== undefined
      ? styled(
          `（安全评分：${options.score}/10）`,
          scoreStyle(options.score),
          ANSI.bold,
        )
      : "";
  lines.push(
    `${label("理由：")}${styled(options.reason, ANSI.bold)}${scoreText}`,
  );
  return {
    title: `${label("确认工具调用：")}${styled(options.toolName, ANSI.bold, ANSI.cyan)}`,
    body: lines.join("\n"),
  };
}
