import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { transformInput, createZshOperations } from "./zsh-proxy";

export default function piZshProxy(pi: ExtensionAPI): void {
  pi.on("input", async (event) => {
    const result = transformInput(event.text);
    if (result.action === "transform") {
      return result;
    }
    return { action: "continue" };
  });

  pi.on("user_bash", (_event, _ctx) => {
    return { operations: createZshOperations() };
  });
}
