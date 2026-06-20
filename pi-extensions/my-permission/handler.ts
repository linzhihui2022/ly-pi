import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PERMISSION_OPTIONS } from "./types";

export async function promptPermission(
  ctx: ExtensionContext,
  label: string,
  onAllowSession: () => void,
  onDenySession: () => void,
): Promise<{ block: true; reason: string } | undefined> {
  if (!ctx.hasUI) {
    return {
      block: true,
      reason: `Denied ${label} (no UI available for approval)`,
    };
  }
  const choice = await ctx.ui.select(
    `Allow ${label}?`,
    [...PERMISSION_OPTIONS],
  );
  switch (choice) {
    case PERMISSION_OPTIONS[0]:
      return undefined;
    case PERMISSION_OPTIONS[1]:
      onAllowSession();
      return undefined;
    case PERMISSION_OPTIONS[2]:
      return { block: true, reason: `Denied ${label} by user (once)` };
    case PERMISSION_OPTIONS[3]:
      onDenySession();
      return { block: true, reason: `Denied ${label} by user (session)` };
    default:
      return { block: true, reason: `Denied ${label} (no choice made)` };
  }
}
