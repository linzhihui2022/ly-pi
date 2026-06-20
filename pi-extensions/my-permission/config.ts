import { type PermissionConfig, PermissionConfigSchema } from "./types";
import { Check } from "typebox/value";
import config from "./config.json";

const defaultConfig: PermissionConfig = {
  permission: {
    bash: [],
    path: [],
    tool: [],
  },
};

export function loadConfig(
  notify?: (message: string, type?: "info" | "warning" | "error") => void,
  rawConfig: unknown = config,
): PermissionConfig {
  if (Check(PermissionConfigSchema, rawConfig)) {
    return rawConfig;
  }
  notify?.(
    "Invalid my-permission config.json; using default permissions.",
    "error",
  );
  return defaultConfig;
}
