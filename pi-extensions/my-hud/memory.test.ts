import { describe, it, expect, vi } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const PAGE_SIZE = 16384;

function buildVmStat({
  free = 1000,
  active = 1000,
  inactive = 1000,
  wired = 1000,
  pageSize = PAGE_SIZE,
}: {
  free?: number;
  active?: number;
  inactive?: number;
  wired?: number;
  pageSize?: number;
}) {
  return [
    `Mach Virtual Memory Statistics: (page size of ${pageSize} bytes)`,
    `Pages free: ${free}.`,
    `Pages active: ${active}.`,
    `Pages inactive: ${inactive}.`,
    `Pages wired down: ${wired}.`,
    "Pages speculative: 0.",
    "Pages throttled: 0.",
  ].join("\n");
}

describe("checkMemoryPressure", () => {
  it("returns ok when memory usage is below 80%", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "vm_stat") {
        return buildVmStat({ free: 100000, active: 10000, inactive: 10000, wired: 10000 });
      }
      if (cmd === "sysctl -n hw.memsize") {
        return String(16 * 1024 * 1024 * 1024);
      }
      return "";
    });

    const { checkMemoryPressure } = await import("./memory");
    const status = checkMemoryPressure();

    expect(status.ok).toBe(true);
    expect(status.percent).toBeLessThan(80);
  });

  it("returns not ok when memory usage is at or above 80%", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "vm_stat") {
        return buildVmStat({ free: 1000, active: 400000, inactive: 400000, wired: 100000 });
      }
      if (cmd === "sysctl -n hw.memsize") {
        return String(16 * 1024 * 1024 * 1024);
      }
      return "";
    });

    const { checkMemoryPressure } = await import("./memory");
    const status = checkMemoryPressure();

    expect(status.ok).toBe(false);
    expect(status.percent).toBeGreaterThanOrEqual(80);
  });

  it("returns ok and 0 percent when vm_stat fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("vm_stat not found");
    });

    const { checkMemoryPressure } = await import("./memory");
    const status = checkMemoryPressure();

    expect(status).toEqual({ percent: 0, ok: true });
  });

  it("defaults missing page counts to zero", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "vm_stat") {
        return [
          "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
          "Pages free: 1000.",
          // intentionally omit active/inactive/wired
        ].join("\n");
      }
      if (cmd === "sysctl -n hw.memsize") {
        return String(16 * 1024 * 1024 * 1024);
      }
      return "";
    });

    const { checkMemoryPressure } = await import("./memory");
    const status = checkMemoryPressure();

    expect(status.percent).toBe(0);
    expect(status.ok).toBe(true);
  });

  it("falls back to default page size when vm_stat header is missing", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "vm_stat") {
        return [
          "Mach Virtual Memory Statistics:",
          "Pages free: 1000.",
          "Pages active: 1000.",
          "Pages inactive: 1000.",
          "Pages wired down: 1000.",
        ].join("\n");
      }
      if (cmd === "sysctl -n hw.memsize") {
        return String(16 * 1024 * 1024 * 1024);
      }
      return "";
    });

    const { checkMemoryPressure } = await import("./memory");
    const status = checkMemoryPressure();

    expect(status.percent).toBe(0);
    expect(status.ok).toBe(true);
  });
});
