import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

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

    const result = buildMemoryWarningLines(
      theme,
      { percent: 42, ok: true },
      [],
    );

    expect(result).toBeNull();
  });

  it("returns a warning line with memory percent only when no vitest processes", async () => {
    const { buildMemoryWarningLines } = await import("./memory-widget");
    const theme = createTheme();

    const result = buildMemoryWarningLines(
      theme,
      { percent: 87, ok: false },
    );

    expect(result).toEqual(["⚠️ 内存 87%"]);
    expect(theme.fg).toHaveBeenCalledWith("error", "⚠️ 内存 87%");
  });
});
