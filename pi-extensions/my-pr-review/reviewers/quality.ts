// reviewers/quality.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewQuality(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    for (let i = 0; i < addedLines.length; i++) {
      const line = addedLines[i];
      const lineNumber = estimateLineNumber(file, i);

      if (/console\.(log|warn|error|debug)\(/.test(line)) {
        findings.push({
          type: "debug-log",
          file: file.path,
          line: lineNumber,
          severity: "info",
          description: `Console log statement in production code`,
        });
      }

      if (/debugger;/.test(line)) {
        findings.push({
          type: "debugger-statement",
          file: file.path,
          line: lineNumber,
          severity: "warning",
          description: `Debugger statement should be removed`,
        });
      }
    }

    // Check function complexity
    const functions = extractFunctions(addedLines);
    for (const func of functions) {
      const complexity = calculateComplexity(func.body);
      if (complexity > 10) {
        findings.push({
          type: "high-complexity",
          file: file.path,
          line: func.line,
          severity: "warning",
          description: `Function \`${func.name}\` has cyclomatic complexity of ${complexity} (>10)`,
        });
      }
    }
  }

  return {
    findings,
    summary: {
      debugLogs: findings.filter((f) => f.type === "debug-log").length,
      debuggerStatements: findings.filter((f) => f.type === "debugger-statement").length,
      highComplexity: findings.filter((f) => f.type === "high-complexity").length,
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

interface FunctionBlock {
  name: string;
  line: number;
  body: string[];
}

function extractFunctions(lines: string[]): FunctionBlock[] {
  const functions: FunctionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (match) {
      const body = extractFunctionBody(lines, i);
      functions.push({ name: match[1], line: i + 1, body });
    }
  }
  return functions;
}

function extractFunctionBody(lines: string[], startIndex: number): string[] {
  const body: string[] = [];
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("{")) {
      started = true;
      depth += (line.match(/{/g) || []).length;
    }
    if (started) {
      body.push(line);
      depth -= (line.match(/}/g) || []).length;
      if (depth <= 0) break;
    }
  }
  return body;
}

function calculateComplexity(lines: string[]): number {
  let complexity = 1;
  for (const line of lines) {
    if (/\bif\b/.test(line)) complexity++;
    if (/\belse\s+if\b/.test(line)) complexity++;
    if (/\bwhile\b/.test(line)) complexity++;
    if (/\bfor\b/.test(line)) complexity++;
    if (/\bcase\b/.test(line)) complexity++;
    if (/\?\s*[^:]+:/.test(line)) complexity++;
    if (/\|\||&&/.test(line)) complexity++;
  }
  return complexity;
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
