import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SessionState } from "./session-state.js";

export function registerPermissionCommands(
  pi: ExtensionAPI,
  sessionState: SessionState,
): void {
  pi.registerCommand("yolo", {
    description: "Toggle session-only yolo mode for my-permission",
    handler: async (_args, ctx) => {
      sessionState.toggleYolo();
      const state = sessionState.yolo ? "enabled" : "disabled";
      ctx.ui.notify(`my-permission yolo mode ${state}`, "info");
    },
  });

  pi.registerCommand("yolo-all-sub", {
    description: "Toggle session-only yolo-all-sub mode for my-permission",
    handler: async (_args, ctx) => {
      sessionState.toggleYoloAllSub();
      const state = sessionState.yoloAllSub ? "enabled" : "disabled";
      ctx.ui.notify(`my-permission yolo-all-sub mode ${state}`, "info");
    },
  });
}
