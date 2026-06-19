/**
 * Strip TypeScript annotations from mac-overlay.ts for JXA compatibility.
 * JXA runs in osascript's JavaScript engine — no TS support, no modules.
 *
 * This script removes:
 * - type aliases (type X = ...)
 * - type annotations (: string, : number, etc.)
 * - deno-lint-ignore comments
 * - blank lines left by removal
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = resolve(__dirname, "mac-overlay.ts");
const outPath = resolve(__dirname, "..", "dist", "mac-overlay.js");

let src = readFileSync(srcPath, "utf-8");

// Remove type aliases: type OverlayColor = ...;
src = src.replace(/^type\s+\w+\s*=\s*.*;?\s*$/gm, "");

// Remove type annotations on variables and params:
//   var x: string = ...  →  var x = ...
//   function f(a: string, b: number): void {
//   argv: string[]  →  argv
//   timer: $  →  timer
src = src.replace(
  /:\s*(string|number|boolean|void|any|OverlayColor|\$)(\[\])?/g,
  "",
);

// Remove // deno-lint-ignore comments
src = src.replace(/\/\/\s*deno-lint-ignore.*\n/g, "");

// Remove trailing commas before closing parentheses. JXA's JavaScriptCore may be older
// than the ES2017 function-parameter trailing-comma feature, so keep the compiled
// output maximally compatible.
src = src.replace(/,(\s*\))/g, "$1");

// Collapse multiple blank lines
src = src.replace(/\n{3,}/g, "\n\n");

writeFileSync(outPath, src, "utf-8");
console.log(`Built: ${outPath} (${src.length} bytes)`);
