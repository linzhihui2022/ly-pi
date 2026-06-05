import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { transformInput, createZshOperations } from "./zsh-proxy";

export default function piZshProxy(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx) => {
    const result = transformInput(event.text);
    if (result.action !== "transform") {
      return { action: "continue" };
    }

    const transformed = result.text!; // "!cmd" or "!!cmd"
    const isSilent = transformed.startsWith("!!");
    const prefixLen = isSilent ? 2 : 1;
    const cmd = transformed.slice(prefixLen);

    if (!cmd) {
      ctx.ui.notify(
        `${isSilent ? "$$" : "$"}: no command provided`,
        "warn",
      );
      return { action: "handled" };
    }

    try {
      const ops = createZshOperations();
      const bashResult = await ops.exec(cmd, ctx.cwd);
      const output = bashResult.output || "(no output)";

      if (bashResult.exitCode !== 0) {
        ctx.ui.notify(`Exit code: ${bashResult.exitCode}`, "error");
      }

      if (isSilent) {
        ctx.ui.notify(output, bashResult.exitCode === 0 ? "info" : "error");
      } else {
        pi.sendUserMessage(`$ ${cmd}\n${output}`);
      }
    } catch (err) {
      ctx.ui.notify(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }

    return { action: "handled" };
  });
}
