import type { FileTree } from "../types";

const LEGACY = /(^|\/)(REQUIREMENTS|SPEC)\.md$/;

export function checkNoLegacyDocs(tree: FileTree): string[] {
  const failures: string[] = [];
  for (const key of tree.keys()) {
    if (LEGACY.test(key)) failures.push(`legacy doc ${key} must be removed`);
  }
  return failures;
}
