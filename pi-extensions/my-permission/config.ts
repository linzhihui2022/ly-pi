import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Check, Errors } from "typebox/value";
import { PermissionConfigSchema, type PermissionConfig } from "./types";

export function resolveConfigPath(override?: string): string {
  if (override) return override;
  const deployed = join(
    homedir(),
    ".pi/agent/extensions/my-permission/config.json",
  );
  if (existsSync(deployed)) return deployed;
  return new URL("./config.json", import.meta.url).pathname;
}

export function loadConfig(
  configPath: string,
  notify?: (message: string, level: "error") => void,
): PermissionConfig {
  if (!existsSync(configPath)) {
    return { deny: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return { deny: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message =
      err instanceof Error
        ? `配置文件 JSON 解析失败：${err.message}`
        : "配置文件 JSON 解析失败";
    notify?.(message, "error");
    return { deny: [] };
  }

  if (!Check(PermissionConfigSchema, parsed)) {
    const errors = [...Errors(PermissionConfigSchema, parsed)]
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    notify?.(`配置文件格式错误：${errors}`, "error");
    return { deny: [] };
  }

  return parsed as PermissionConfig;
}
