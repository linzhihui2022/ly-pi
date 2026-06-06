import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { loadConfig, type ToolDisplayConfig } from "./config";
import { createReadToolOverride } from "./tool-overrides";

export default function myToolDisplay(pi: ExtensionAPI): void {
  let config: ToolDisplayConfig = loadConfig();

  const getConfig = (): ToolDisplayConfig => config;

  pi.on("before_agent_start", async () => {
    // Refresh config in case it changed externally
    config = loadConfig();

    // Register read tool override
    const readOverride = createReadToolOverride(getConfig);
    const builtInRead = createReadTool(process.cwd());

    pi.registerTool({
      name: readOverride.name,
      label: readOverride.label,
      description: builtInRead.description,
      parameters: builtInRead.parameters,
      prepareArguments: builtInRead.prepareArguments,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return builtInRead.execute(toolCallId, params, signal, onUpdate);
      },
      renderCall: readOverride.renderCall,
      renderResult: readOverride.renderResult,
    } as any);
  });
}
