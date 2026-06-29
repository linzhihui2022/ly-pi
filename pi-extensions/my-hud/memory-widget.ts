import type { Theme } from "@earendil-works/pi-coding-agent";
import type { MemoryStatus } from "./memory";
import type { VitestProcess } from "./vitest-process";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function buildMemoryWarningLines(
  theme: Theme,
  memoryStatus: MemoryStatus,
  vitestProcesses: VitestProcess[],
): string[] | null {
  if (memoryStatus.ok) return null;

  let text = `⚠️ 内存 ${memoryStatus.percent}%`;

  if (vitestProcesses.length > 0) {
    const sorted = [...vitestProcesses].sort((a, b) => a.pid - b.pid);
    const procs = sorted.map((p) => `${p.pid}(${formatBytes(p.rssBytes)})`).join(", ");
    text += ` · vitest ${procs}`;
  }

  return [theme.fg("error", text)];
}
