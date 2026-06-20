import picomatch from "picomatch";
import type { PermissionConfig, PermissionRuleItem } from "./types";

export type ActionFrom = "config" | "runtime";

export interface AskAction {
  action: "ask";
  rule: string;
  from: ActionFrom;
}

export interface DenyAction {
  action: "deny";
  rule: string;
  from: ActionFrom;
}

export interface AllowAction {
  action: "allow";
}

export type Action = AskAction | DenyAction | AllowAction;

export class PermissionState {
  public config: PermissionConfig | null = null;
  public runtimeConfig: Pick<PermissionConfig["permission"], "path" | "bash"> = {
    path: [],
    bash: [],
  };

  init(config: PermissionConfig): void {
    this.config = config;
  }

  buildAction(from: ActionFrom, rule?: PermissionRuleItem): Action {
    if (rule?.value === "deny") {
      return { action: "deny", rule: rule.key, from };
    }
    if (rule?.value === "allow") {
      return { action: "allow" };
    }
    return { action: "ask", rule: rule?.key ?? "default", from };
  }

  matchPathRules(
    key: string,
    rules?: PermissionRuleItem[],
  ): PermissionRuleItem | undefined {
    const targetRules = rules ?? this.config?.permission.path ?? [];
    const matches = targetRules.filter((rule) => picomatch.isMatch(key, rule.key));
    return matches.at(-1);
  }

  matchBashRules(
    command: string,
    rules?: PermissionRuleItem[],
  ): PermissionRuleItem | undefined {
    const targetRules = rules ?? this.config?.permission.bash ?? [];
    const matches = targetRules.filter((rule) => {
      try {
        return new RegExp(rule.key).test(command);
      } catch {
        return false;
      }
    });
    return matches.at(-1);
  }
}
