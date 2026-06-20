import { describe, expect, it, vi } from "vitest";
import { promptPermission } from "./handler";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function makeCtx(hasUI: boolean, choice?: string): ExtensionContext {
  return {
    hasUI,
    ui: {
      select: vi.fn(async () => choice),
    },
  } as unknown as ExtensionContext;
}

describe("promptPermission", () => {
  it("blocks when UI is unavailable", async () => {
    const ctx = makeCtx(false);
    const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd (no UI available for approval)",
    });
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it("returns undefined for Allow once", async () => {
    const ctx = makeCtx(true, "Allow once");
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
    expect(result).toBeUndefined();
    expect(onAllow).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("calls onAllowSession for Allow for this session", async () => {
    const ctx = makeCtx(true, "Allow for this session");
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
    expect(result).toBeUndefined();
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it("blocks for Deny once", async () => {
    const ctx = makeCtx(true, "Deny once");
    const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd by user (once)",
    });
  });

  it("calls onDenySession and blocks for Deny for this session", async () => {
    const ctx = makeCtx(true, "Deny for this session");
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    const result = await promptPermission(ctx, "read /etc/passwd", onAllow, onDeny);
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd by user (session)",
    });
    expect(onAllow).not.toHaveBeenCalled();
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("blocks when user cancels", async () => {
    const ctx = makeCtx(true, undefined);
    const result = await promptPermission(ctx, "read /etc/passwd", vi.fn(), vi.fn());
    expect(result).toEqual({
      block: true,
      reason: "Denied read /etc/passwd (no choice made)",
    });
  });
});
