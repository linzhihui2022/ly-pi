import { execSync } from "node:child_process";

export interface VitestProcess {
  pid: number;
  rssBytes: number;
  command: string;
}

export function findVitestProcesses(): VitestProcess[] {
  try {
    const output = execSync("ps -axo pid,command,rss", { encoding: "utf-8" });
    const lines = output.trim().split("\n");

    // Skip header line
    const dataLines = lines.slice(1);

    const processes: VitestProcess[] = [];

    for (const line of dataLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse: PID COMMAND... RSS
      // RSS is the last whitespace-separated token
      const match = trimmed.match(/^(\d+)\s+(.+?)\s+(\d+)$/);
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      const command = match[2].trim();
      const rss = parseInt(match[3], 10);

      const lowerCommand = command.toLowerCase();
      const isNode = lowerCommand.includes("node");
      const isVitest = lowerCommand.includes("vitest");

      if (isNode && isVitest) {
        processes.push({ pid, rssBytes: rss * 1024, command });
      }
    }

    return processes;
  } catch {
    return [];
  }
}
