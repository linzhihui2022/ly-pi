import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runAllChecks } from "./checks/run";
import { buildFileTree, isTriageSkillInstalled } from "./file-system";

const repoRoot = resolve(import.meta.dir, "..", "..");

const results = runAllChecks({
  tree: buildFileTree(repoRoot),
  triageSkillInstalled: isTriageSkillInstalled([
    join(homedir(), ".agents/skills"),
    join(homedir(), ".pi/agent/skills"),
  ]),
});

let failed = 0;
for (const result of results) {
  if (result.failures.length === 0) {
    console.log(`PASS ${result.name}`);
  } else {
    failed += result.failures.length;
    console.log(`FAIL ${result.name}`);
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }
}

if (failed > 0) {
  console.log(`\ncheck-docs: ${failed} failure(s)`);
  process.exit(1);
}
console.log("\ncheck-docs: all checks passed");
