import { Box, type Component, Text } from "@earendil-works/pi-tui";

/**
 * Pi's default tool shell draws the call component and the result component inside one padded,
 * background-filled box. Under `renderShell: "self"` each render slot is handed back to Pi as its own
 * child, so this module draws that same box itself: the call slot opens the row frame and hands it to Pi,
 * the result slot fills it without contributing lines of its own.
 */
type RowTheme = { bg(color: string, text: string): string };

type RowRenderContext = {
  state?: unknown;
  isPartial?: boolean;
  isError?: boolean;
};

type RowFrameState = {
  /** Row frame opened by the call slot in the current render pass. */
  rowFrame?: RowFrame;
  /** Whether the opened row frame is already in Pi's component tree for this pass. */
  rowFrameOpen?: boolean;
};

class RowFrame extends Box {
  private callContent: Component | undefined;
  private resultContent: Component | undefined;

  constructor(background: (text: string) => string) {
    super(1, 1, background);
  }

  setCall(content: Component): void {
    this.callContent = content;
    this.syncChildren();
  }

  setResult(content: Component): void {
    this.resultContent = content;
    this.syncChildren();
  }

  private syncChildren(): void {
    this.clear();
    if (this.callContent) {
      this.addChild(this.callContent);
    }
    if (this.resultContent) {
      this.addChild(this.resultContent);
    }
  }
}

/**
 * A slot that shows nothing: the row frame then belongs to the other slot, and a slot whose frame is
 * already in Pi's component tree adds no second row of its own.
 */
export function emptyRowContent(): Component {
  return new Text("", 0, 0);
}

function rowFrameState(
  context: RowRenderContext | undefined,
): RowFrameState | undefined {
  const state = context?.state;
  return state !== null && typeof state === "object"
    ? (state as RowFrameState)
    : undefined;
}

function rowBackground(context: RowRenderContext | undefined): string {
  if (context?.isPartial) {
    return "toolPendingBg";
  }
  if (context?.isError) {
    return "toolErrorBg";
  }
  return "toolSuccessBg";
}

function createRowFrame(
  context: RowRenderContext | undefined,
  theme: RowTheme,
): RowFrame {
  const color = rowBackground(context);
  return new RowFrame((text) => theme.bg(color, text));
}

/**
 * Context for a native renderer whose slot the row frame owns. Pi's renderers treat `lastComponent` as
 * their own reusable component and mutate it in place (`setText`), so they must never receive the row
 * frame we hand back to Pi; without it they build a fresh component for the pass instead.
 */
export function rowContentContext<Context extends { lastComponent?: unknown }>(
  context: Context,
): Omit<Context, "lastComponent"> & { lastComponent: undefined } {
  return { ...context, lastComponent: undefined };
}

/** Call slot: opens the row frame for this render pass and hands it back to Pi. */
export function rowFrameCall(
  context: RowRenderContext | undefined,
  theme: RowTheme,
  content: Component,
): Component {
  const frame = createRowFrame(context, theme);
  const state = rowFrameState(context);
  if (state) {
    state.rowFrame = frame;
    state.rowFrameOpen = true;
  }
  frame.setCall(content);
  return frame;
}

/**
 * Result slot: fills the row frame the call slot handed to Pi. When no such frame is open — the call slot
 * contributed nothing, or the renderer is used on its own — the result owns the frame instead.
 */
export function rowFrameResult(
  context: RowRenderContext | undefined,
  theme: RowTheme,
  content: Component,
): Component {
  const state = rowFrameState(context);
  if (state?.rowFrameOpen && state.rowFrame) {
    state.rowFrameOpen = false;
    state.rowFrame.setResult(content);
    return emptyRowContent();
  }
  const frame = createRowFrame(context, theme);
  frame.setResult(content);
  return frame;
}
