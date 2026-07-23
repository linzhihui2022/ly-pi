import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { PermissionsService } from "@gotgenes/pi-permission-system";
import { createJudge } from "./judge";
import { createReviewer } from "./reviewer";

const SERVICE_KEY = Symbol.for("@gotgenes/pi-permission-system:service");
const AUTHORIZER_NAME = "my-judge";

export default function myPermissionJudge(pi: ExtensionAPI): void {
  let currentCtx: ExtensionContext | undefined;
  let disposer: (() => void) | undefined;

  function notify(message: string, type: "info" | "warning"): void {
    try {
      currentCtx?.ui.notify(message, type);
    } catch {
      // swallow
    }
  }

  pi.on("session_start", (_event, ctx) => {
    currentCtx = ctx;
  });

  pi.events.on("permissions:ready", () => {
    const service = (globalThis as Record<symbol, unknown>)[SERVICE_KEY] as
      | PermissionsService
      | undefined;

    if (!service) {
      return;
    }

    try {
      disposer = service.registerAuthorizer(
        AUTHORIZER_NAME,
        createJudge(
          createReviewer(() => currentCtx),
          notify,
        ),
      );
    } catch {
      // Registration failure is not fatal; the next /reload will retry.
    }
  });

  pi.on("session_shutdown", () => {
    try {
      disposer?.();
    } catch {
      // swallow
    }
    disposer = undefined;
    currentCtx = undefined;
  });
}
