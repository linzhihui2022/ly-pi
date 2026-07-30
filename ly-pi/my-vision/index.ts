import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visionPromptSuffix } from "./vision";

export default function myVision(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${visionPromptSuffix(ctx.model)}`,
    };
  });
}
