import * as fs from "node:fs";
import type { ProjectConfig, ProjectRules } from "./project-rules.js";

export type PermissionAction = "allow" | "deny" | "ask";

export interface MergedConfig {
  default: PermissionAction;
  external: PermissionAction;
  log: { debug: boolean; review: boolean };
  tools: Record<string, PermissionAction>;
  bash: Record<string, PermissionAction>;
  paths: Record<string, PermissionAction>;
  skills: Record<string, PermissionAction>;
}

export interface ConfigLoaderOptions {
  globalConfigPath: string;
  projectRules: ProjectRules;
}

export interface ConfigLoader {
  loadConfig(cwd: string): MergedConfig;
  mergeConfig(global: ProjectConfig, project: ProjectConfig): MergedConfig;
  invalidateCache(): void;
}

const DEFAULT_CONFIG: MergedConfig = {
  default: "ask",
  external: "ask",
  log: { debug: false, review: true },
  tools: {},
  bash: {},
  paths: {},
  skills: {},
};

function fillDefaults(config: ProjectConfig): MergedConfig {
  return {
    default: config.default ?? DEFAULT_CONFIG.default,
    external: config.external ?? DEFAULT_CONFIG.external,
    log: { ...DEFAULT_CONFIG.log, ...config.log },
    tools: { ...config.tools },
    bash: { ...config.bash },
    paths: { ...config.paths },
    skills: { ...config.skills },
  };
}

export function createConfigLoader(options: ConfigLoaderOptions): ConfigLoader {
  const cache = new Map<string, MergedConfig>();

  function loadGlobalConfig(): ProjectConfig {
    if (!fs.existsSync(options.globalConfigPath)) {
      return {};
    }
    const content = fs.readFileSync(options.globalConfigPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  }

  return {
    loadConfig(cwd: string): MergedConfig {
      const cached = cache.get(cwd);
      if (cached) {
        return cached;
      }

      const global = loadGlobalConfig();
      const project = options.projectRules.loadProjectConfig(cwd);
      const merged = this.mergeConfig(global, project ?? {});

      cache.set(cwd, merged);
      return merged;
    },

    mergeConfig(global: ProjectConfig, project: ProjectConfig): MergedConfig {
      const base = fillDefaults(global);
      return {
        default: project.default ?? base.default,
        external: project.external ?? base.external,
        log: { ...base.log, ...project.log },
        tools: { ...base.tools, ...project.tools },
        bash: { ...base.bash, ...project.bash },
        paths: { ...base.paths, ...project.paths },
        skills: { ...base.skills, ...project.skills },
      };
    },

    invalidateCache(): void {
      cache.clear();
    },
  };
}
