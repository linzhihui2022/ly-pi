import { ANSI as C } from "./ansi";

const GREY = "\x1b[90m";

export interface DiffLine {
  type: "keep" | "add" | "remove";
  text: string;
}

/** Compute line-level diff between old and new text using LCS. */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "keep", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

/** Format diff as color-coded text for confirm dialog body. */
export function formatDiff(oldText: string, newText: string): string {
  const diff = computeDiff(oldText, newText);
  const adds = diff.filter((d) => d.type === "add").length;
  const removes = diff.filter((d) => d.type === "remove").length;

  const lines: string[] = [];
  lines.push(
    `${C.bold}变更预览 (${adds + removes} 处: ${C.green}+${adds}${C.reset}${C.bold} ${C.red}−${removes}${C.reset}${C.bold})${C.reset}`,
  );
  lines.push("");

  for (const d of diff) {
    if (d.type === "keep") {
      lines.push(`${GREY}  ${d.text}${C.reset}`);
    } else if (d.type === "add") {
      lines.push(`${C.green}+ ${d.text}${C.reset}`);
    } else {
      lines.push(`${C.red}− ${d.text}${C.reset}`);
    }
  }

  return lines.join("\n");
}
