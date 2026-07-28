import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the extension directory at runtime.
 *
 * Tries in order:
 * 1. `import.meta.url` — native ESM, and jiti (which shims it).
 * 2. `process.cwd()` — last-resort fallback.
 */
export function resolveExtDir(importMeta?: ImportMeta): string {
  if (importMeta) {
    try {
      return dirname(fileURLToPath(importMeta.url));
    } catch {
      /* fileURLToPath failed — fall through */
    }
  }

  return process.cwd();
}
