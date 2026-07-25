import type { FileTree } from "../types";

const ISSUE_FILE = /^\.scratch\/[^/]+\/issues\/([^/]+\.md)$/;
const ISSUE_NAME = /^\d{2}-[a-z0-9-]+\.md$/;
const STATUS_LINE = /^\**Status:\**\s*(\S+)\s*$/m;
const BUILTIN_STATUSES = ["claimed", "resolved"];

function configuredLabels(tree: FileTree): string[] {
  const content = tree.get("docs/agents/triage-labels.md");
  if (content === undefined) return [];
  const labels: string[] = [];
  for (const line of content.split("\n")) {
    if (!line.startsWith("|")) continue;
    const secondCell = line.split("|")[2] ?? "";
    const match = /`([^`]+)`/.exec(secondCell);
    if (match) labels.push(match[1]);
  }
  return labels;
}

export function checkScratchConventions(tree: FileTree): string[] {
  const allowed = new Set([...configuredLabels(tree), ...BUILTIN_STATUSES]);
  const failures: string[] = [];
  for (const [path, content] of tree) {
    const match = ISSUE_FILE.exec(path);
    if (!match) continue;
    if (!ISSUE_NAME.test(match[1])) {
      failures.push(`${path} does not match the NN-slug.md naming convention`);
      continue;
    }
    const status = STATUS_LINE.exec(content);
    if (!status) {
      failures.push(`${path} has no Status line`);
      continue;
    }
    if (!allowed.has(status[1])) {
      failures.push(`${path} has unknown status: ${status[1]}`);
    }
  }
  return failures;
}
