import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelsApiStreamOptions,
  ModelThinkingLevel,
} from "@earendil-works/pi-ai";

export interface ModelClient {
  find(provider: string, id: string): Model<Api> | undefined;
  complete(
    model: Model<Api>,
    context: Context,
    options?: ModelsApiStreamOptions<Api>,
  ): Promise<AssistantMessage>;
}

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
  auditModel: string;
  auditThinking: ModelThinkingLevel;
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
  /** The actual model used for the judge call (provider/id). */
  modelUsed?: string;
}

export interface ToolInput {
  toolName: string;
  value: string;
  paths: string[];
}
