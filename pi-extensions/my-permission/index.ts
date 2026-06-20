import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { PermissionState } from "./state";
import { ReadPermission } from "./read";
import { BashPermission } from "./bash";
import { loadConfig } from "./config";

export default function myPermission(pi: ExtensionAPI): void {
  const state = new PermissionState();
  pi.on("session_start", async (_event, ctx) => {
    state.init(loadConfig(ctx.ui.notify));
  });

  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const readPermission = new ReadPermission(state, event, ctx);
      return readPermission.handleAction(readPermission.check());
    }
    if (isToolCallEventType("bash", event)) {
      const bashPermission = new BashPermission(state, event, ctx);
      return bashPermission.handleAction(bashPermission.check());
    }
  });
}
