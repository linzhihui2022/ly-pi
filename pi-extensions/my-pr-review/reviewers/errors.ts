// reviewers/errors.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewErrors(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];
  let tryCatchCount = 0;
  let emptyCatchCount = 0;
  let bareThrowCount = 0;
  let promiseUncaught = 0;

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/\btry\b/.test(line)) {
        tryCatchCount++;
      }

      if (/\bcatch\s*\(/.test(line)) {
        const catchBody = getCatchBody(addedLines, i);
        if (isEmptyCatch(catchBody)) {
          emptyCatchCount++;
          findings.push({
            type: "empty-catch",
            file: file.path,
            line: lineNumber,
            severity: "critical",
            description: `Empty catch block silently swallows error`,
          });
        }
      }

      if (/throw\s+['"]/.test(line)) {
        bareThrowCount++;
        findings.push({
          type: "bare-throw",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Throwing a string instead of an Error object`,
        });
      }

      if (/\.then\s*\([^)]*\)\s*$/.test(line) && !addedLines.slice(i, i + 5).some((l) => /\.catch/.test(l))) {
        promiseUncaught++;
        findings.push({
          type: "uncaught-promise",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Promise chain without .catch() handler`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      tryCatchCount,
      emptyCatchCount,
      bareThrowCount,
      promiseUncaught,
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

function getCatchBody(lines: string[], catchIndex: number): string[] {
  const body: string[] = [];
  let depth = 0;
  for (let i = catchIndex; i < lines.length; i++) {
    const line = lines[i];
    body.push(line);
    const openCount = (line.match(/{/g) || []).length;
    const closeCount = (line.match(/}/g) || []).length;
    if (i === catchIndex) {
      depth += openCount;
    } else {
      depth += openCount - closeCount;
    }
    if (depth <= 0 && body.length > 1) break;
  }
  return body;
}

function isEmptyCatch(body: string[]): boolean {
  const content = body
    .slice(1, -1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
  return content.length === 0;
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
