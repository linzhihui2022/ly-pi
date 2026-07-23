export type Action = "allow" | "ask" | "deny";

export interface DenyWithReason {
  action: "deny";
  reason: string;
}

export type RuleValue = Action | DenyWithReason;

export interface PermissionMap {
  [pattern: string]: RuleValue;
}

export interface PermissionConfig {
  [surface: string]: RuleValue | PermissionMap | undefined;
}

export interface Config {
  defaultPolicy: Action;
  judgeModel: string;
  judgeTimeoutMs: number;
  childPolicy: "deny-on-unsafe" | "allow-on-safe";
  permission: PermissionConfig;
}

export interface Verdict {
  action: Action;
  reason?: string;
  source?: string;
  matchedPattern?: string;
}

export interface JudgeResult {
  safe: boolean;
  reason: string;
  toolFor: string;
}

export interface ToolInput {
  toolName: string;
  value: string;
  paths: string[];
}
