import type { FileTree } from "../types";

const SOURCES = ["README.md", "AGENTS.md"];
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

function isExternal(target: string): boolean {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#")
  );
}

export function checkRelativeLinks(tree: FileTree): string[] {
  const failures: string[] = [];
  for (const source of SOURCES) {
    const content = tree.get(source);
    if (content === undefined) continue;
    for (const match of content.matchAll(LINK)) {
      const target = match[1].trim();
      if (isExternal(target)) continue;
      const path = target.split("#")[0];
      if (path === "") continue;
      const resolved = path.replace(/^\.\//, "");
      if (!tree.has(resolved)) {
        failures.push(`${source} links to ${target} which does not exist`);
      }
    }
  }
  return failures;
}
