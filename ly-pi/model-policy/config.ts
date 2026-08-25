import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createModelPolicyRegistry,
  type LocalModelOverride,
  type ModelPolicyManifest,
} from "./registry";

export const MODEL_MANIFEST_FILE = "model-policies.json";
export const LOCAL_MODEL_OVERRIDE_FILE = "models.local.json";

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot load ${label}: ${message}`);
  }
}

function readOptionalJson(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot load local model override: ${message}`);
  }
}

export function loadModelPolicyRegistry(extensionDir: string) {
  const manifest = readJson(
    join(extensionDir, MODEL_MANIFEST_FILE),
    "model manifest",
  ) as ModelPolicyManifest;
  const localOverride = readOptionalJson(
    join(extensionDir, LOCAL_MODEL_OVERRIDE_FILE),
  ) as LocalModelOverride | undefined;

  return createModelPolicyRegistry(manifest, localOverride);
}
