// reviewers/tests.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewTests(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  const testFiles = files.filter((f) => isTestFile(f.path));
  const sourceFiles = files.filter(
    (f) => isSourceFile(f.path) && !isTestFile(f.path)
  );

  for (const source of sourceFiles) {
    const baseName = getBaseName(source.path);
    const hasTest = testFiles.some((t) => {
      const testBase = getBaseName(t.path);
      return testBase === baseName || t.path.includes(baseName);
    });

    if (!hasTest) {
      findings.push({
        type: "missing-test",
        file: source.path,
        severity: source.status === "added" ? "warning" : "info",
        description:
          source.status === "added"
            ? `New file \`${source.path}\` has no corresponding test`
            : `Modified file \`${source.path}\` has no test updates`,
      });
    }
  }

  for (const source of sourceFiles) {
    if (source.status !== "modified") continue;
    const baseName = getBaseName(source.path);
    const hasTestUpdate = testFiles.some((t) => {
      const testBase = getBaseName(t.path);
      return (testBase === baseName || t.path.includes(baseName)) && t.additions > 0;
    });

    if (!hasTestUpdate && source.additions > 0) {
      findings.push({
        type: "uncovered-change",
        file: source.path,
        severity: "info",
        description: `Changes in \`${source.path}\` not reflected in tests`,
      });
    }
  }

  return {
    findings,
    summary: {
      testFiles: testFiles.length,
      sourceFiles: sourceFiles.length,
      missingTests: findings.filter((f) => f.type === "missing-test").length,
      uncoveredChanges: findings.filter((f) => f.type === "uncovered-change").length,
    },
  };
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\./.test(path) || /[\/_]test[\/_]/.test(path);
}

function isSourceFile(path: string): boolean {
  return /\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(path);
}

function getBaseName(path: string): string {
  return path
    .replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, "")
    .replace(/\.[^.]+$/, "");
}
