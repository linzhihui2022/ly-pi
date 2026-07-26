import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the extension directory in a way that works across
 * CJS (`__dirname`), ESM (`import.meta.url`), and bundled environments.
 */
export function resolveExtDir(importMeta?: ImportMeta): string {
  if (typeof __dirname !== "undefined") return __dirname;
  if (importMeta) {
    try {
      return dirname(fileURLToPath(importMeta.url));
    } catch {
      /* ESM resolution failed — fall through */
    }
  }
  return process.cwd();
}
