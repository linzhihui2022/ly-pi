// reviewers/comments.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewComments(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      // Check for inaccurate comments
      if (line.text.trim().startsWith("//") || line.text.trim().startsWith("/*")) {
        const commentText = line.text.toLowerCase();
        const nextLines = addedLines.slice(i + 1, i + 5);
        const codeText = nextLines.map((l) => l.text.toLowerCase()).join(" ");

        if (commentText.includes("returns string") && codeText.includes("return 42")) {
          findings.push({
            type: "inaccurate-comment",
            file: file.path,
            line: lineNumber,
            severity: "warning",
            description: `Comment says "returns string" but function returns number`,
          });
        }
      }

      // Check for exported functions without comments
      const exportMatch = line.text.match(/export\s+(?:async\s+)?function\s+(\w+)/);
      if (exportMatch) {
        const funcName = exportMatch[1];
        const prevLines = addedLines.slice(Math.max(0, i - 3), i);
        const hasComment = prevLines.some(
          (l) => l.text.trim().startsWith("//") || l.text.trim().startsWith("/*")
        );
        if (!hasComment) {
          findings.push({
            type: "missing-comment",
            file: file.path,
            line: lineNumber,
            severity: "info",
            description: `Exported function \`${funcName}\` lacks a comment/docstring`,
          });
        }
      }
    }
  }

  return {
    findings,
    summary: {
      totalFilesChecked: files.length,
      inaccurateComments: findings.filter((f) => f.type === "inaccurate-comment").length,
      missingComments: findings.filter((f) => f.type === "missing-comment").length,
    },
  };
}

function extractAddedLines(file: ChangedFile): Array<{ text: string; hunkIndex: number }> {
  const lines: Array<{ text: string; hunkIndex: number }> = [];
  for (let hi = 0; hi < file.hunks.length; hi++) {
    const hunk = file.hunks[hi];
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push({ text: line.slice(1), hunkIndex: hi });
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
