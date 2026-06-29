import { describe, it, expect, vi } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

function psLine(pid: number, command: string, rss: number): string {
  return `${pid.toString().padStart(5)} ${command} ${rss}`;
}

describe("findVitestProcesses", () => {
  it("returns empty array when no vitest processes are running", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        psLine(1, "/sbin/launchd", 1024),
        psLine(2, "/usr/sbin/kernel_task", 2048),
        psLine(100, "node index.js", 51200),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toEqual([]);
  });

  it("finds node processes whose command contains vitest", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        psLine(1, "/sbin/launchd", 1024),
        psLine(44124, "node /path/to/vitest.mjs run", 1249328),
        psLine(44126, "/usr/local/bin/node node_modules/vitest/vitest.mjs", 858240),
        psLine(100, "node index.js", 51200),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toHaveLength(2);
    expect(processes).toContainEqual({ pid: 44124, rssBytes: 1249328 * 1024, command: "node /path/to/vitest.mjs run" });
    expect(processes).toContainEqual({ pid: 44126, rssBytes: 858240 * 1024, command: "/usr/local/bin/node node_modules/vitest/vitest.mjs" });
  });

  it("ignores processes whose command contains vitest but is not node", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        psLine(50, "grep vitest", 1024),
        psLine(51, "vi vitest.log", 2048),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toEqual([]);
  });

  it("ignores case when matching node", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        psLine(44124, "NODE /path/to/vitest.mjs run", 1249328),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(44124);
  });

  it("returns empty array when ps output is malformed", async () => {
    vi.mocked(execSync).mockReturnValue("not a ps output");

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toEqual([]);
  });

  it("returns empty array when ps fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("ps failed");
    });

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toEqual([]);
  });

  it("skips empty lines and malformed lines", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        "",
        "   ",
        "this is not a valid line",
        psLine(44124, "node /path/to/vitest.mjs run", 1249328),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(44124);
  });

  it("skips node processes that do not contain vitest", async () => {
    vi.mocked(execSync).mockReturnValue(
      [
        "  PID COMMAND          RSS",
        psLine(100, "node index.js", 51200),
        psLine(101, "node server.ts", 102400),
      ].join("\n"),
    );

    const { findVitestProcesses } = await import("./vitest-process");
    const processes = findVitestProcesses();

    expect(processes).toEqual([]);
  });
});
