import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

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
    `工具：${options.toolName}`,
    `操作：${options.toolFor}`,
    `输入：${options.value}`,
    `工作目录：${options.cwd}`,
  ];
  if (options.paths.length > 0) {
    lines.push(`涉及路径：${options.paths.join(", ")}`);
  }
  const scoreSuffix =
    options.score !== undefined ? `（安全评分：${options.score}/10）` : "";
  lines.push(`理由：${options.reason}${scoreSuffix}`);
  return {
    title: `确认工具调用：${options.toolName}`,
    body: lines.join("\n"),
  };
}
