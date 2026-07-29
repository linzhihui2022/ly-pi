import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the extension directory at runtime.
 *
 * Tries in order:
 * 1. `import.meta.url` via `fileURLToPath` — native ESM / jiti with file:// URL.
 * 2. `import.meta.url` as a bare path — some jiti versions produce non-URL paths.
 * 3. `import.meta.dirname` — ES2023 (Node 21+, Bun).
 * 4. `process.cwd()` — last-resort fallback.
 */
export function resolveExtDir(importMeta?: ImportMeta): string {
  if (importMeta) {
    // Try standard file:// URL first
    try {
      return dirname(fileURLToPath(importMeta.url));
    } catch {
      /* not a valid file:// URL — try other formats */
    }

    // Some jiti versions produce bare paths (no file:// prefix)
    if (importMeta.url.startsWith("/")) {
      return dirname(importMeta.url);
    }

    // ES2023 — Node 21+, Bun (note: type-checked via interface extension below)
    const dirnameProp = (importMeta as Record<string, unknown>)["dirname"];
    if (typeof dirnameProp === "string" && dirnameProp.length > 0) {
      return dirnameProp;
    }
  }

  return process.cwd();
}
