import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadToolDisplayConfig } from "./config";
import { registerToolRenderers } from "./tools";

const initializedApis = new WeakSet<ExtensionAPI>();

export default function myToolDisplay(pi: ExtensionAPI): void {
  if (initializedApis.has(pi)) {
    return;
  }

  initializedApis.add(pi);
  pi.on("session_start", () => {
    const config = loadToolDisplayConfig();
    if (!config.enabled) {
      return;
    }
    registerToolRenderers(pi, config);
  });
}
