export type GlobPatternType =
  | "exact"
  | "prefix"
  | "suffix"
  | "contains"
  | "globstar"
  | "all";

export interface GlobPattern {
  type: GlobPatternType;
  source: string;
}

/**
 * Compile a glob-like pattern into a structured pattern.
 *
 * Supported syntax:
 * - `*`      matches any sequence of characters except `/`
 * - `**`     matches any sequence of characters including `/`
 * - exact text matches literal characters
 *
 * Patterns with `**` are treated as globstar patterns. Otherwise the pattern
 * is classified by the position of its `*` segments.
 */
export function compileGlob(source: string): GlobPattern {
  if (source === "*") {
    return { type: "all", source };
  }

  if (source.includes("**")) {
    return { type: "globstar", source };
  }

  const stars = source.split("*").length - 1;
  if (stars === 0) {
    return { type: "exact", source };
  }

  if (stars === 1) {
    if (source.startsWith("*")) {
      return { type: "suffix", source };
    }
    if (source.endsWith("*")) {
      return { type: "prefix", source };
    }
  }

  return { type: "contains", source };
}

/**
 * Escape a literal string so it can be safely used in a RegExp.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a RegExp for a glob pattern that does not contain `**`.
 * Single `*` matches any character except `/`.
 */
function buildSegmentRegExp(source: string): RegExp {
  const parts = source.split("*").map(escapeRegExp);
  // Join with "[^/]*" so a single star cannot cross a path separator.
  const body = parts.join("[^/]*");
  return new RegExp(`^${body}$`);
}

/**
 * Build a RegExp for a globstar pattern. `**` matches any sequence of
 * characters including `/`. A `*` that is not part of `**` still does not
 * cross `/`.
 */
function buildGlobstarRegExp(source: string): RegExp {
  // Use placeholders that survive the subsequent split on "*".
  const starStarSlash = "\0SSS\0";
  const starStar = "\0SS\0";

  let body = source;

  // `**/` matches zero or more directory segments followed by a slash.
  body = body.split("**/").join(starStarSlash);
  // Remaining `**` matches any sequence including slashes.
  body = body.split("**").join(starStar);

  // Escape literal characters and replace single stars with [^/]*.
  body = body.split("*").map(escapeRegExp).join("[^/]*");

  // Restore placeholders with their regex equivalents.
  body = body.split(starStarSlash).join("(?:.*/)?");
  body = body.split(starStar).join(".*");

  return new RegExp(`^${body}$`);
}

/**
 * Match a value against a glob pattern.
 */
export function matchGlob(patternSource: string, value: string): boolean {
  const pattern = compileGlob(patternSource);

  switch (pattern.type) {
    case "all":
      return true;
    case "exact":
      return value === pattern.source;
    case "globstar":
      return buildGlobstarRegExp(pattern.source).test(value);
    case "prefix":
    case "suffix":
    case "contains":
      return buildSegmentRegExp(pattern.source).test(value);
  }
}
