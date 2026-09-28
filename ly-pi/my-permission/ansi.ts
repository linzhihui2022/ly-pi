/** ANSI escape codes for terminal styling. */
export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
} as const;

export function style(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ANSI.reset}`;
}
