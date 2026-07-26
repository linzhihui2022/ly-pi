import type { Theme } from "@earendil-works/pi-coding-agent";
import type { MemoryStatus } from "./memory";

export function buildMemoryWarningLines(
  theme: Theme,
  memoryStatus: MemoryStatus,
): string[] | null {
  if (memoryStatus.ok) return null;
  return [theme.fg("error", `⚠️ 内存 ${memoryStatus.percent}%`)];
}
