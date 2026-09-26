import type { CheckContext, CheckResult } from "../types";
import { checkAgentDocs } from "./agent-docs";
import { checkExtensionTable } from "./extension-table";
import { checkNoLegacyDocs } from "./no-legacy-docs";
import { checkRelativeLinks } from "./relative-links";

export function runAllChecks(context: CheckContext): CheckResult[] {
  return [
    { name: "extension-table", failures: checkExtensionTable(context.tree) },
    { name: "relative-links", failures: checkRelativeLinks(context.tree) },
    {
      name: "agent-docs",
      failures: checkAgentDocs(context.tree, context.triageSkillInstalled),
    },
    { name: "no-legacy-docs", failures: checkNoLegacyDocs(context.tree) },
  ];
}
