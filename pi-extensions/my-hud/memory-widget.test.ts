import { describe, it, expect, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";

function createTheme(): Theme {
  return {
    fg: vi.fn((_c: string, text: string) => text),
    bg: vi.fn((_c: string, text: string) => text),
    bold: vi.fn((text: string) => text),
    italic: vi.fn((text: string) => text),
    underline: vi.fn((text: string) => text),
    inverse: vi.fn((text: string) => text),
    strikethrough: vi.fn((text: string) => text),
    getFgAnsi: vi.fn(() => ""),
    getBgAnsi: vi.fn(() => ""),
    getColorMode: vi.fn(() => "truecolor"),
    getThinkingBorderColor: vi.fn(() => (str: string) => str),
    getBashModeBorderColor: vi.fn(() => (str: string) => str),
  } as any;
}

describe("buildMemoryWarningLines", () => {
  it("returns null when memory status is ok", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 42, ok: true }, []);

    expect(result).toBeNull();
  });

  it("returns a warning line with memory percent only when no vitest processes", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 87, ok: false }, []);

    expect(result).toEqual(["⚠️ 内存 87%"]);
    expect(theme.fg).toHaveBeenCalledWith("error", "⚠️ 内存 87%");
  });

  it("returns a warning line with memory percent and vitest processes", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 87, ok: false }, [
      { pid: 44124, rssBytes: 1249328 * 1024, command: "node vitest.mjs run" },
      { pid: 44126, rssBytes: 1500 * 1024 * 1024, command: "node vitest.mjs run" },
    ]);

    expect(result).toEqual(["⚠️ 内存 87% · vitest 44124(1.2GB), 44126(1.5GB)"]);
    expect(theme.fg).toHaveBeenCalledWith(
      "error",
      "⚠️ 内存 87% · vitest 44124(1.2GB), 44126(1.5GB)",
    );
  });

  it("sorts vitest processes by pid ascending", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 87, ok: false }, [
      { pid: 50000, rssBytes: 1024 * 1024 * 1024, command: "node vitest.mjs run" },
      { pid: 10000, rssBytes: 1024 * 1024 * 1024, command: "node vitest.mjs run" },
    ]);

    expect(result).toEqual(["⚠️ 内存 87% · vitest 10000(1.0GB), 50000(1.0GB)"]);
  });

  it("formats vitest rss in bytes and kilobytes when small", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 87, ok: false }, [
      { pid: 1, rssBytes: 512, command: "node vitest.mjs run" },
      { pid: 2, rssBytes: 1536, command: "node vitest.mjs run" },
    ]);

    expect(result).toEqual(["⚠️ 内存 87% · vitest 1(512B), 2(1.5KB)"]);
  });

  it("formats vitest rss in megabytes", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(theme, { percent: 87, ok: false }, [
      { pid: 1, rssBytes: 5 * 1024 * 1024, command: "node vitest.mjs run" },
    ]);

    expect(result).toEqual(["⚠️ 内存 87% · vitest 1(5.0MB)"]);
  });
});
