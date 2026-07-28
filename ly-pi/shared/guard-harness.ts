import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export interface GuardConfig<TDet = unknown> {
  name: string;
  detect: (command: string, cwd: string) => TDet | undefined;
  react: (
    detection: TDet,
    event: BashToolCallEvent,
    ctx: ExtensionContext,
  ) =>
    | undefined
    | ToolCallEventResult
    | Promise<undefined | ToolCallEventResult>;
  onSessionStart?: (cwd: string) => void;
  onBeforeAgentStart?: (
    systemPrompt: string,
    cwd: string,
  ) => string | undefined;
  escalation?: {
    threshold: number;
    buildConfirm: (
      detection: TDet,
      count: number,
    ) => { title: string; body: string };
  };
}

export function createGuardHarness(
  pi: ExtensionAPI,
  guards: GuardConfig[],
): void {
  let cwd = "";
  const escalationCounts: Record<string, number> = {};

  pi.on("session_start", (_event, ctx) => {
    cwd = ctx.cwd;
    for (const guard of guards) {
      try {
        guard.onSessionStart?.(cwd);
      } catch (err) {
        console.warn(
          `[guard-harness] Guard "${guard.name}" onSessionStart error:`,
          err,
        );
      }
    }
  });

  pi.on("before_agent_start", async (event) => {
    let prompt = event.systemPrompt;
    for (const guard of guards) {
      try {
        const result = guard.onBeforeAgentStart?.(prompt, cwd);
        if (result !== undefined) prompt = result;
      } catch (err) {
        console.warn(
          `[guard-harness] Guard "${guard.name}" onBeforeAgentStart error:`,
          err,
        );
      }
    }
    return { systemPrompt: prompt };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;

    for (const guard of guards) {
      try {
        const detection = guard.detect(event.input.command, ctx.cwd);
        if (!detection) continue;

        if (guard.escalation) {
          escalationCounts[guard.name] =
            (escalationCounts[guard.name] ?? 0) + 1;
          if (
            escalationCounts[guard.name] > guard.escalation.threshold &&
            ctx.hasUI
          ) {
            const { title, body } = guard.escalation.buildConfirm(
              detection,
              escalationCounts[guard.name],
            );
            const allowed = await ctx.ui.confirm(title, body);
            if (allowed) continue;
          }
        }

        const result = await guard.react(detection, event, ctx);
        if (result?.block) return result;
      } catch (err) {
        console.warn(`[guard-harness] Guard "${guard.name}" error:`, err);
      }
    }
    return undefined;
  });
}
