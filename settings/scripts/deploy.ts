import { homedir } from "node:os";
import { join } from "node:path";

const srcPath = "settings.json";
const destPath = join(homedir(), ".pi/agent/settings.json");

const src = JSON.parse(await Bun.file(srcPath).text());

let merged: Record<string, unknown>;
try {
  const existing = JSON.parse(await Bun.file(destPath).text());
  merged = deepMerge(existing as Record<string, unknown>, src);
  // Remove extensions key — it's now auto-discovered
  delete merged.extensions;
} catch {
  merged = src;
}

await Bun.write(destPath, `${JSON.stringify(merged, null, 2)}\n`);

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = result[key];
    const overlayVal = overlay[key];
    if (isObject(baseVal) && isObject(overlayVal)) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>,
      );
    } else {
      result[key] = overlayVal;
    }
  }
  return result;
}

function isObject(v: unknown): v is object {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
