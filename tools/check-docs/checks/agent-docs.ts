import type { FileTree } from "../types";

const REQUIRED = ["docs/agents/issue-tracker.md", "docs/agents/domain.md"];

export function checkAgentDocs(
  tree: FileTree,
  triageSkillInstalled: boolean,
): string[] {
  const failures: string[] = [];
  for (const path of REQUIRED) {
    if (!tree.has(path)) failures.push(`${path} not found`);
  }
  if (triageSkillInstalled && !tree.has("docs/agents/triage-labels.md")) {
    failures.push(
      "docs/agents/triage-labels.md not found (triage skill is installed)",
    );
  }
  return failures;
}
