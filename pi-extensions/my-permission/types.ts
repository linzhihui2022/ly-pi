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
  professorModel: string;
  professorThinking: string;
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
  score?: number;
  reason: string;
  toolFor: string;
  /** Cost in USD from the judge LLM call. */
  cost?: number;
}

export interface ToolInput {
  toolName: string;
  value: string;
  paths: string[];
}
