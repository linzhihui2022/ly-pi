// reviewers/types.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewTypes(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  let newTypes = 0;
  let modifiedTypes = 0;

  for (const file of files) {
    if (!/\.(ts|tsx|d\.ts)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/\btype\s+\w+/.test(line) || /\binterface\s+\w+/.test(line)) {
        if (file.status === "added") {
          newTypes++;
        } else {
          modifiedTypes++;
        }
      }

      if (/:\s*any\b/.test(line)) {
        findings.push({
          type: "implicit-any",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Usage of \`any\` type reduces type safety`,
        });
      }

      const funcMatch = line.match(
        /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*[^:{]/
      );
      if (funcMatch) {
        findings.push({
          type: "missing-return-type",
          file: file.path,
          line: lineNumber,
          severity: "info",
          description: `Exported function \`${funcMatch[1]}\` lacks explicit return type`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      newTypes,
      modifiedTypes,
      anyUsages: findings.filter((f) => f.type === "implicit-any").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): string[] {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push(line.slice(1));
      }
    }
  }
  return lines;
}

function estimateLineNumber(file: ChangedFile, addedLineIndex: number): number {
  let count = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        if (count === addedLineIndex) {
          return hunk.newStart + count;
        }
        count++;
      }
    }
  }
  return 0;
}
