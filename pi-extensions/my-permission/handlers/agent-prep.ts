import type { BeforeAgentStartEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MergedConfig } from "../config.js";

export interface AgentPrepDependencies {
  loadConfig(): MergedConfig;
}

export function createAgentPrepHandler(deps: AgentPrepDependencies) {
  return function handleAgentPrep(
    event: BeforeAgentStartEvent,
    _ctx: ExtensionContext,
  ): { systemPrompt?: string } | undefined {
    const config = deps.loadConfig();
    const denied = Object.entries(config.tools)
      .filter(([, action]) => action === "deny")
      .map(([name]) => name);

    if (denied.length === 0) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n[my-permission] Denied tools: ${denied.join(", ")}`,
    };
  };
}
