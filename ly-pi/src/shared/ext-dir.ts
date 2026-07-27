import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the extension directory at runtime.
 *
 * Tries in order:
 * 1. `import.meta.url` — native ESM, and jiti (which shims it).
 * 2. `__dirname` via eval — CJS / jiti / vitest where `import.meta`
 *    may be stripped. Must use eval because bundlers (bun --target node)
 *    inline `typeof __dirname` as a per-file compile-time constant, and
 *    in the flat single-scope bundle the last assignment wins across all
 *    modules. eval forces runtime resolution from the actual loader.
 * 3. `process.cwd()` — last-resort fallback.
 */
export function resolveExtDir(importMeta?: ImportMeta): string {
  if (importMeta) {
    try {
      return dirname(fileURLToPath(importMeta.url));
    } catch {
      /* fileURLToPath failed — try __dirname */
    }
  }

  // __PI_TEST_SKIP_DIRNAME is a test hook: when set, skip the eval branch
  // so the process.cwd() fallback path can be covered.
  if (!(globalThis as Record<string, unknown>).__PI_TEST_SKIP_DIRNAME) {
    try {
      // eslint-disable-next-line no-eval
      return eval("__dirname") as string;
    } catch {
      /* __dirname not available — fall through */
    }
  }

  return process.cwd();
}
