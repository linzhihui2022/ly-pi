import * as fs from "node:fs";
import * as path from "node:path";
import type { MergedConfig } from "./config.js";
import type { SessionRule } from "./session-state.js";

export type SubagentPolicy = "yolo" | "read-only" | "inherit-parent";

export interface InheritedRules {
  config: MergedConfig;
  sessionRules: SessionRule[];
  yolo: boolean;
}

export interface SubagentPolicySnapshot {
  policy: SubagentPolicy;
  inheritedRules?: InheritedRules;
}

export interface SubagentPolicyManager {
  getDefaultPolicy(yoloAllSub: boolean): SubagentPolicy;
  writePolicySnapshot(
    policy: SubagentPolicy,
    inherited: InheritedRules,
    parentSessionId: string,
  ): string;
  readPolicySnapshot(filePath: string): SubagentPolicySnapshot | undefined;
  deletePolicySnapshot(filePath: string): void;
  isSubagentProcess(env: Record<string, string | undefined>): boolean;
}

export interface SubagentPolicyManagerOptions {
  snapshotsDir: string;
}

export function createSubagentPolicyManager(
  options: SubagentPolicyManagerOptions,
): SubagentPolicyManager {
  return {
    getDefaultPolicy(yoloAllSub: boolean): SubagentPolicy {
      return yoloAllSub ? "yolo" : "inherit-parent";
    },

    writePolicySnapshot(
      policy: SubagentPolicy,
      inherited: InheritedRules,
      parentSessionId: string,
    ): string {
      fs.mkdirSync(options.snapshotsDir, { recursive: true });

      const snapshot: SubagentPolicySnapshot =
        policy === "inherit-parent"
          ? { policy, inheritedRules: inherited }
          : { policy };

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 10);
      const fileName = `${parentSessionId}-${timestamp}-${random}.json`;
      const filePath = path.join(options.snapshotsDir, fileName);

      const tempPath = `${filePath}.tmp.${process.pid}`;
      const content = JSON.stringify(snapshot, null, 2) + "\n";
      fs.writeFileSync(tempPath, content, "utf-8");
      fs.renameSync(tempPath, filePath);

      return filePath;
    },

    readPolicySnapshot(filePath: string): SubagentPolicySnapshot | undefined {
      if (!fs.existsSync(filePath)) {
        return undefined;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as SubagentPolicySnapshot;
    },

    deletePolicySnapshot(filePath: string): void {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore missing-file errors; deletions are idempotent.
      }
    },

    isSubagentProcess(env: Record<string, string | undefined>): boolean {
      if (env.MY_PERMISSION_SUBAGENT_POLICY) return true;
      if (env.MY_PERMISSION_SUBAGENT_POLICY_FILE) return true;
      return false;
    },
  };
}
