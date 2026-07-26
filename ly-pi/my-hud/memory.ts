import { execSync } from "node:child_process";

export interface MemoryStatus {
  percent: number;
  ok: boolean;
}

export function checkMemoryPressure(): MemoryStatus {
  try {
    const vmStat = execSync("vm_stat", { encoding: "utf-8" });
    const totalMem = parseInt(
      execSync("sysctl -n hw.memsize", { encoding: "utf-8" }).trim(),
      10,
    );

    const pageSizeMatch = vmStat.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;

    const pages = (key: string) => {
      const match = vmStat.match(new RegExp(`${key}:\\s+(\\d+)\\.`));
      return match ? parseInt(match[1], 10) : 0;
    };

    const wired = pages("Pages wired down");
    const active = pages("Pages active");
    const inactive = pages("Pages inactive");

    const used = (wired + active + inactive) * pageSize;
    const percent = Math.round((used / totalMem) * 100);

    return { percent, ok: percent < 80 };
  } catch {
    return { percent: 0, ok: true };
  }
}
