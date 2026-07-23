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
  toolName: string,
  toolFor: string,
  reason: string,
): Promise<boolean> {
  if (!ctx.hasUI) return false;
  return await ctx.ui.confirm(
    `Tool call needs confirmation: ${toolName}`,
    `${toolFor}\n\nReason: ${reason}`,
  );
}
