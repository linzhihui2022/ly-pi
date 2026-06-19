import type { ExtensionContext, SessionStartEvent, SessionShutdownEvent } from "@earendil-works/pi-coding-agent";
import type { MergedConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { SessionRule, SessionState } from "../session-state.js";

export interface LifecycleDependencies {
  loadConfig(): MergedConfig;
  sessionState: SessionState;
  logger: Logger;
}

export function createLifecycleHandler(deps: LifecycleDependencies) {
  return {
    handleSessionStart(
      event: SessionStartEvent,
      ctx: ExtensionContext,
    ): void {
      const config = deps.loadConfig();
      deps.logger.setDebugEnabled(config.log.debug ?? false);

      if (event.reason === "reload") {
        const rules: SessionRule[] = [];
        for (const entry of ctx.sessionManager.getEntries()) {
          if (
            entry.type === "custom" &&
            entry.customType === "my-permission:session-rule"
          ) {
            rules.push(entry.data);
          }
        }
        if (rules.length > 0) {
          deps.sessionState.restoreSessionRules(rules);
        }
      }
    },

    handleSessionShutdown(
      _event: SessionShutdownEvent,
      _ctx: ExtensionContext,
    ): void {
      deps.logger.flush();
    },
  };
}
