// reviewers/simplification.ts
import type { ChangedFile, ReviewFinding, ReviewResult } from "../types";

export function reviewSimplification(files: ChangedFile[]): ReviewResult {
  const findings: ReviewFinding[] = [];

  for (const file of files) {
    if (!/\.(ts|js|tsx|jsx|py|rs|go|java)$/.test(file.path)) continue;

    const addedLines = extractAddedLines(file);

    // Check for long functions
    const functions = extractFunctions(addedLines);
    for (const func of functions) {
      if (func.body.length > 50) {
        findings.push({
          type: "long-function",
          file: file.path,
          line: func.line,
          severity: "info",
          description: `Function \`${func.name}\` is ${func.body.length} lines long. Consider extracting helpers.`,
        });
      }
    }

    // Check for deep nesting
    const maxDepth = calculateMaxNestingDepth(addedLines);
    if (maxDepth > 4) {
      findings.push({
        type: "deep-nesting",
        file: file.path,
        line: 1,
        severity: "warning",
        description: `Code has nesting depth of ${maxDepth}. Consider early returns or extracting functions.`,
      });
    }

    // Check for duplicate code blocks (simple heuristic: 3+ consecutive identical lines)
    const duplicates = findDuplicateBlocks(addedLines);
    for (const dup of duplicates) {
      findings.push({
        type: "duplicate-code",
        file: file.path,
        line: dup.line,
        severity: "info",
        description: `Duplicate block of ${dup.length} lines detected. Consider extracting to a function.`,
      });
    }
  }

  return {
    findings,
    summary: {
      longFunctions: findings.filter((f) => f.type === "long-function").length,
      deepNesting: findings.filter((f) => f.type === "deep-nesting").length,
      duplicateBlocks: findings.filter((f) => f.type === "duplicate-code").length,
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

function calculateMaxNestingDepth(lines: string[]): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (const line of lines) {
    const openCount = (line.match(/[{(]/g) || []).length;
    const closeCount = (line.match(/[})]/g) || []).length;
    currentDepth += openCount - closeCount;
    maxDepth = Math.max(maxDepth, currentDepth);
  }
  return maxDepth;
}

interface DuplicateBlock {
  line: number;
  length: number;
}

function findDuplicateBlocks(lines: string[]): DuplicateBlock[] {
  const duplicates: DuplicateBlock[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i <= lines.length - 3; i++) {
    const block = lines.slice(i, i + 3).join("\n");
    const trimmed = block.replace(/\s+/g, " ").trim();
    if (seen.has(trimmed)) {
      duplicates.push({ line: i + 1, length: 3 });
    } else {
      seen.set(trimmed, i);
    }
  }

  return duplicates;
}
