import type {
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import type { PermissionChecker } from "../checker.js";
import type { MergedConfig } from "../config.js";
import type { DialogResult, DialogUI } from "../dialog.js";
import type { Logger } from "../logger.js";
import type { SessionState } from "../session-state.js";
import type { SubagentPolicyManager } from "../subagent-policy.js";

export interface ToolCallDependencies {
  loadConfig(): MergedConfig;
  sessionState: SessionState;
  checkerFactory(
    config: MergedConfig,
    sessionState: SessionState,
  ): PermissionChecker;
  dialog(
    check: ReturnType<PermissionChecker["check"]>,
    ui: DialogUI,
  ): Promise<DialogResult>;
  logger: Logger;
  subagentPolicy: SubagentPolicyManager;
  saveProjectRule?(cwd: string, surface: string, pattern: string): void;
}

function getToolInput(event: ToolCallEvent): Record<string, unknown> {
  return event.input as Record<string, unknown>;
}

function buildCheckInput(
  event: ToolCallEvent,
): import("../checker.js").CheckInput {
  const input = getToolInput(event);
  return {
    toolName: event.toolName,
    command: typeof input.command === "string" ? input.command : undefined,
    path: typeof input.path === "string" ? input.path : undefined,
    skillName:
      typeof input.skillName === "string" ? input.skillName : undefined,
  };
}

export function createToolCallHandler(deps: ToolCallDependencies) {
  return async function handleToolCall(
    event: ToolCallEvent,
    ctx: ExtensionContext,
  ): Promise<ToolCallEventResult | undefined> {
    const config = deps.loadConfig();
    const checker = deps.checkerFactory(config, deps.sessionState);
    const check = checker.check(buildCheckInput(event));

    let result: ToolCallEventResult | undefined;
    let finalCheck = check;

    if (check.state === "deny") {
      result = {
        block: true,
        reason: `Permission denied: ${check.surface} "${check.value}"`,
      };
    } else if (check.state === "ask") {
      if (!ctx.hasUI) {
        result = {
          block: true,
          reason: `Permission denied: ${check.surface} "${check.value}" (no UI)`,
        };
      } else {
        const dialogResult = await deps.dialog(check, ctx.ui as DialogUI);
        finalCheck = applyDialogResult(
          dialogResult,
          check,
          deps.sessionState,
          deps.saveProjectRule,
          ctx.cwd,
        );
        if (finalCheck.state !== "allow") {
          result = {
            block: true,
            reason: `Permission denied: ${finalCheck.surface} "${finalCheck.value}"`,
          };
        }
      }
    }

    if (result?.block) {
      deps.logger.logReview({
        type: "decision",
        toolName: event.toolName,
        surface: finalCheck.surface,
        value: finalCheck.value,
        state: finalCheck.state,
        origin: finalCheck.origin,
        matchedPattern: finalCheck.matchedPattern,
        blocked: true,
      });
      return result;
    }

    if (event.toolName === "subagent") {
      injectSubagentPolicy(
        event,
        config,
        deps.sessionState,
        deps.subagentPolicy,
        ctx.sessionManager.getSessionId(),
      );
    }

    deps.logger.logReview({
      type: "decision",
      toolName: event.toolName,
      surface: finalCheck.surface,
      value: finalCheck.value,
      state: finalCheck.state,
      origin: finalCheck.origin,
      matchedPattern: finalCheck.matchedPattern,
      blocked: false,
    });

    return result;
  };
}

function applyDialogResult(
  dialogResult: DialogResult,
  check: import("../checker.js").CheckResult,
  sessionState: SessionState,
  saveProjectRule:
    | ((cwd: string, surface: string, pattern: string) => void)
    | undefined,
  cwd: string,
): import("../checker.js").CheckResult {
  switch (dialogResult.kind) {
    case "allow-once":
      return { ...check, state: "allow", origin: "session" };
    case "allow-session": {
      sessionState.addSessionRule({
        surface: check.surface,
        pattern: check.value,
        action: "allow",
      });
      return { ...check, state: "allow", origin: "session" };
    }
    case "allow-project": {
      saveProjectRule?.(cwd, check.surface, check.value);
      return { ...check, state: "allow", origin: "project" };
    }
    case "deny-with-reason":
      return { ...check, state: "deny", origin: "session" };
    case "deny":
      return { ...check, state: "deny", origin: "session" };
  }
}

function injectSubagentPolicy(
  event: ToolCallEvent,
  config: MergedConfig,
  sessionState: SessionState,
  subagentPolicy: SubagentPolicyManager,
  parentSessionId: string,
): void {
  const policy = subagentPolicy.getDefaultPolicy(sessionState.yoloAllSub);
  const snapshotPath = subagentPolicy.writePolicySnapshot(
    policy,
    {
      config,
      sessionRules: [],
      yolo: sessionState.yolo,
    },
    parentSessionId,
  );

  const input = getToolInput(event);
  input.MY_PERMISSION_SUBAGENT_POLICY_FILE = snapshotPath;
}
