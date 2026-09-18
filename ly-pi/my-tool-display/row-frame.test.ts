import { Box, type Component, Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { emptyRowContent, rowFrameCall, rowFrameResult } from "./row-frame";

const plainTheme = {
  bg: (_color: string, text: string) => text,
};

const colorTheme = {
  bg: (color: string, text: string) => `<${color}>${text}</>`,
};

type RowContext = {
  state: unknown;
  isPartial: boolean;
  isError: boolean;
};

function rowContext(overrides: Partial<RowContext> = {}): RowContext {
  return { state: {}, isPartial: false, isError: false, ...overrides };
}

function rowsOf(component: Component, width = 40): string[] {
  return component.render(width).map((line) => line.trimEnd());
}

describe("row frame", () => {
  it("draws the call content inside the padded, background-filled frame", () => {
    const row = rowFrameCall(rowContext(), plainTheme, new Text("call", 0, 0));

    expect(rowsOf(row)).toEqual(["", " call", ""]);
  });

  it("keeps the result inside the frame opened by the call slot", () => {
    const context = rowContext();
    const row = rowFrameCall(context, plainTheme, new Text("call", 0, 0));
    const result = rowFrameResult(
      context,
      plainTheme,
      new Text("result", 0, 0),
    );

    expect(result.render(40)).toEqual([]);
    expect(rowsOf(row)).toEqual(["", " call", " result", ""]);
  });

  it("owns the frame when the call slot contributed nothing", () => {
    const row = rowFrameResult(
      rowContext(),
      plainTheme,
      new Text("result", 0, 0),
    );

    expect(rowsOf(row)).toEqual(["", " result", ""]);
  });

  it("recovers when the call slot does not reach the result slot", () => {
    const context = rowContext();
    rowFrameCall(context, plainTheme, new Text("call", 0, 0));
    rowFrameResult(context, plainTheme, new Text("first", 0, 0));

    const recovered = rowFrameResult(
      context,
      plainTheme,
      new Text("second", 0, 0),
    );

    expect(rowsOf(recovered)).toEqual(["", " second", ""]);
  });

  it("opens a fresh frame for every render pass", () => {
    const context = rowContext();
    const first = rowFrameCall(context, plainTheme, new Text("first", 0, 0));
    const second = rowFrameCall(context, plainTheme, new Text("second", 0, 0));

    expect(second).not.toBe(first);
    expect(rowsOf(second)).toEqual(["", " second", ""]);
  });

  it("does not share a frame between rows", () => {
    const first = rowFrameCall(
      rowContext(),
      plainTheme,
      new Text("first", 0, 0),
    );
    const second = rowFrameCall(
      rowContext(),
      plainTheme,
      new Text("second", 0, 0),
    );

    expect(rowsOf(first)).toEqual(["", " first", ""]);
    expect(rowsOf(second)).toEqual(["", " second", ""]);
  });

  it("renders no lines when its content is empty", () => {
    const context = rowContext();

    expect(
      rowFrameCall(context, plainTheme, emptyRowContent()).render(40),
    ).toEqual([]);
    expect(
      rowFrameResult(context, plainTheme, emptyRowContent()).render(40),
    ).toEqual([]);
  });

  it("selects the background from the render state", () => {
    expect(
      rowsOf(
        rowFrameCall(
          rowContext({ isPartial: true }),
          colorTheme,
          new Text("x", 0, 0),
        ),
      )[1],
    ).toContain("<toolPendingBg>");
    expect(
      rowsOf(
        rowFrameCall(
          rowContext({ isError: true }),
          colorTheme,
          new Text("x", 0, 0),
        ),
      )[1],
    ).toContain("<toolErrorBg>");
    expect(
      rowsOf(rowFrameCall(rowContext(), colorTheme, new Text("x", 0, 0)))[1],
    ).toContain("<toolSuccessBg>");
  });

  it("keeps every line within the render width", () => {
    const context = rowContext();
    const row = rowFrameCall(
      context,
      plainTheme,
      new Text("x".repeat(100), 0, 0),
    );
    rowFrameResult(context, plainTheme, new Text("y".repeat(100), 0, 0));

    const lines = row.render(20);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("matches the composition Pi's default shell produces", () => {
    const call = new Text("$ bun test", 0, 0);
    const result = new Text("12 passed", 0, 0);
    const defaultShell = new Box(1, 1, (text) =>
      colorTheme.bg("toolSuccessBg", text),
    );
    defaultShell.addChild(call);
    defaultShell.addChild(result);

    const context = rowContext();
    const row = rowFrameCall(context, colorTheme, call);
    rowFrameResult(context, colorTheme, result);

    expect(row.render(30)).toEqual(defaultShell.render(30));
  });

  it("ignores renderer state it does not own", () => {
    const row = rowFrameCall(
      { state: "not a row state" },
      plainTheme,
      new Text("x", 0, 0),
    );

    expect(rowsOf(row)).toEqual(["", " x", ""]);
  });
});
