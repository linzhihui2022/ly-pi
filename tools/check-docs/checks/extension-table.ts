import type { FileTree } from "../types";

const EXTENSION_DIR = /^pi-extensions\/([^/]+)\/package\.json$/;
const BOLD_NAME = /^\*\*([^*]+)\*\*$/;

function listedExtensions(readme: string): string[] {
  const names: string[] = [];
  for (const line of readme.split("\n")) {
    if (!line.startsWith("|")) continue;
    const firstCell = line.split("|")[1].trim();
    const match = BOLD_NAME.exec(firstCell);
    if (match) names.push(match[1]);
  }
  return names;
}

export function checkExtensionTable(tree: FileTree): string[] {
  const readme = tree.get("README.md");
  if (readme === undefined) return ["README.md not found"];

  const listed = listedExtensions(readme);
  const actual: string[] = [];
  for (const key of tree.keys()) {
    const match = EXTENSION_DIR.exec(key);
    if (match) actual.push(match[1]);
  }

  const failures: string[] = [];
  for (const name of actual) {
    if (!listed.includes(name)) {
      failures.push(
        `pi-extensions/${name} exists but is not listed in the README extension table`,
      );
    }
  }
  for (const name of listed) {
    if (!actual.includes(name)) {
      failures.push(
        `README extension table lists ${name} but pi-extensions/${name} does not exist`,
      );
    }
  }
  return failures;
}
