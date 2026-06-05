// render.ts
import type { ReviewFinding, ReviewResult } from "./types";

export function severityIcon(severity: string): string {
  switch (severity) {
    case "info":
      return "ℹ";
    case "warning":
      return "⚠";
    case "critical":
      return "✗";
    default:
      return "•";
  }
}

export function formatFinding(finding: ReviewFinding): string {
  const icon = severityIcon(finding.severity);
  const location = finding.line
    ? `${finding.file}:${finding.line}`
    : finding.file;
  return `${icon} ${location} — ${finding.description}`;
}

export function formatReviewResult(
  result: ReviewResult,
  title: string
): string {
  const lines: string[] = [`### ${title}`];

  if (result.findings.length === 0) {
    lines.push("✓ No issues found");
    return lines.join("\n");
  }

  for (const finding of result.findings) {
    lines.push(formatFinding(finding));
  }

  if (result.notes) {
    lines.push(`\n_Note: ${result.notes}_`);
  }

  return lines.join("\n");
}

export function renderSeverityForTui(severity: string): string {
  switch (severity) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "muted";
  }
}
