import type { Authorizer } from "@gotgenes/pi-permission-system";

export type JudgeDecision = "allow" | "defer";

export interface Verdict {
  decision: JudgeDecision;
  reason?: string;
}

export interface JudgePrompt {
  system: string;
  user: string;
}

export type ReviewFn = (prompt: JudgePrompt) => Promise<string>;
export type NotifyFn = (
  message: string,
  type: "info" | "warning",
) => void | Promise<void>;

export type AuthorizeFn = Authorizer["authorize"];

export type {
  Authorizer,
  AuthorizerLog,
  AuthorizerVerdict,
  PermissionQuery,
  PromptPermissionDetails,
} from "@gotgenes/pi-permission-system";

export { getPermissionsService } from "@gotgenes/pi-permission-system";
