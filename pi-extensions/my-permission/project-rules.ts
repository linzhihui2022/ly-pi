import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ProjectConfig {
  default?: "allow" | "deny" | "ask";
  external?: "allow" | "deny" | "ask";
  log?: { debug?: boolean; review?: boolean };
  tools?: Record<string, "allow" | "deny" | "ask">;
  bash?: Record<string, "allow" | "deny" | "ask">;
  paths?: Record<string, "allow" | "deny" | "ask">;
  skills?: Record<string, "allow" | "deny" | "ask">;
}

export interface ProjectRules {
  getProjectConfigPath(cwd: string): string;
  loadProjectConfig(cwd: string): ProjectConfig | undefined;
  saveProjectConfig(cwd: string, config: ProjectConfig): void;
}

export function createProjectRules(projectsDir: string): ProjectRules {
  return {
    getProjectConfigPath(cwd: string): string {
      const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
      return path.join(projectsDir, "projects", `${hash}.json`);
    },

    loadProjectConfig(cwd: string): ProjectConfig | undefined {
      const filePath = this.getProjectConfigPath(cwd);
      if (!fs.existsSync(filePath)) {
        return undefined;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as ProjectConfig;
    },

    saveProjectConfig(cwd: string, config: ProjectConfig): void {
      const filePath = this.getProjectConfigPath(cwd);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      const content = JSON.stringify(config, null, 2) + "\n";
      const tempPath = `${filePath}.tmp.${Date.now()}.${process.pid}`;
      fs.writeFileSync(tempPath, content, "utf-8");
      fs.renameSync(tempPath, filePath);
    },
  };
}
