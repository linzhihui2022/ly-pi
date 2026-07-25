import { describe, expect, it, vi } from "vitest";
import { detectInlineScript } from "./detector";
import myScriptGuard, { buildReason } from "./index";

type ToolCallHandler = (
  event: unknown,
  ctx: unknown,
) => Promise<{ block: true; reason: string } | undefined>;

function setup() {
  let handler: ToolCallHandler | undefined;
  const pi = {
    on: vi.fn((name: string, h: ToolCallHandler) => {
      if (name === "tool_call") handler = h;
    }),
  };
  myScriptGuard(pi as never);
  if (!handler) throw new Error("tool_call handler not registered");
  return handler;
}

function bashEvent(command: string) {
  return { toolName: "bash", input: { command } };
}

function uiCtx(hasUI = true) {
  return {
    hasUI,
    ui: { confirm: vi.fn(async () => false) },
  };
}

const LONG_CODE = "x".repeat(81);
const LONG_EVAL = `python3 -c "${LONG_CODE}"`;

describe("myScriptGuard tool_call handler", () => {
  it("blocks a long inline eval with a guiding reason", async () => {
    const handler = setup();
    const result = await handler(bashEvent(LONG_EVAL), uiCtx());
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("python3");
    expect(result?.reason).toContain("write");
  });

  it("ignores non-bash tools", async () => {
    const handler = setup();
    const event = { toolName: "read", input: { path: "x" } };
    expect(await handler(event, uiCtx())).toBeUndefined();
  });

  it("allows normal bash commands", async () => {
    const handler = setup();
    expect(
      await handler(bashEvent("python3 script.py"), uiCtx()),
    ).toBeUndefined();
  });

  it("hard-blocks the first 3 attempts without asking the user", async () => {
    const handler = setup();
    const ctx = uiCtx();
    for (let i = 0; i < 3; i++) {
      const result = await handler(bashEvent(LONG_EVAL), ctx);
      expect(result?.block).toBe(true);
    }
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("escalates to user confirmation from the 4th attempt; approval lets it through", async () => {
    const handler = setup();
    const ctx = uiCtx();
    ctx.ui.confirm.mockResolvedValue(true);
    for (let i = 0; i < 3; i++) await handler(bashEvent(LONG_EVAL), ctx);
    const result = await handler(bashEvent(LONG_EVAL), ctx);
    expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it("escalates to user confirmation; rejection keeps blocking", async () => {
    const handler = setup();
    const ctx = uiCtx();
    ctx.ui.confirm.mockResolvedValue(false);
    for (let i = 0; i < 4; i++) await handler(bashEvent(LONG_EVAL), ctx);
    const result = await handler(bashEvent(LONG_EVAL), ctx);
    expect(ctx.ui.confirm).toHaveBeenCalledTimes(2);
    expect(result?.block).toBe(true);
  });

  it("never asks when there is no UI; keeps blocking", async () => {
    const handler = setup();
    const ctx = uiCtx(false);
    for (let i = 0; i < 5; i++) {
      const result = await handler(bashEvent(LONG_EVAL), ctx);
      expect(result?.block).toBe(true);
    }
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });

  it("does not count allowed commands toward the escalation threshold", async () => {
    const handler = setup();
    const ctx = uiCtx();
    for (let i = 0; i < 10; i++) await handler(bashEvent("ls -la"), ctx);
    for (let i = 0; i < 3; i++) {
      const result = await handler(bashEvent(LONG_EVAL), ctx);
      expect(result?.block).toBe(true);
    }
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });
});

describe("buildReason", () => {
  it("names the interpreter, the kind, and the file-based alternative", () => {
    const detection = detectInlineScript(`python3 -c "${LONG_CODE}"`);
    if (!detection) throw new Error("expected detection");
    const reason = buildReason(detection);
    expect(reason).toContain("python3");
    expect(reason).toContain("eval");
    expect(reason).toContain("python3 <file>");
  });
});
