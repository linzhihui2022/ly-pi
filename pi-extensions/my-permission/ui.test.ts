import { describe, expect, it, vi } from "vitest";
import { confirmToolCall, createSessionCache, isChildSession } from "./ui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const mockCtx = (confirmValue: boolean): ExtensionContext =>
  ({
    hasUI: true,
    ui: { confirm: vi.fn().mockResolvedValue(confirmValue) },
  }) as unknown as ExtensionContext;

describe("isChildSession", () => {
  it("returns true when PI_SUBAGENT_PARENT_SESSION is set", () => {
    process.env.PI_SUBAGENT_PARENT_SESSION = "parent-id";
    expect(isChildSession()).toBe(true);
    delete process.env.PI_SUBAGENT_PARENT_SESSION;
  });

  it("returns false otherwise", () => {
    expect(isChildSession()).toBe(false);
  });
});

describe("createSessionCache", () => {
  it("caches approved keys", () => {
    const cache = createSessionCache();
    cache.approve("bash:git status");
    expect(cache.isApproved("bash:git status")).toBe(true);
    expect(cache.isApproved("bash:rm -rf")).toBe(false);
  });
});

describe("confirmToolCall", () => {
  it("returns true when user confirms", async () => {
    const ctx = mockCtx(true);
    const ok = await confirmToolCall(ctx, "read", "read src/main.ts", "routine read");
    expect(ok).toBe(true);
    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Tool call needs confirmation: read",
      "read src/main.ts\n\nReason: routine read",
    );
  });

  it("returns false when user denies", async () => {
    const ctx = mockCtx(false);
    const ok = await confirmToolCall(ctx, "read", "read src/main.ts", "routine read");
    expect(ok).toBe(false);
  });

  it("returns false when hasUI is false", async () => {
    const ctx = {
      hasUI: false,
      ui: { confirm: vi.fn() },
    } as unknown as ExtensionContext;
    const ok = await confirmToolCall(ctx, "bash", "rm -rf /", "dangerous");
    expect(ok).toBe(false);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });
});
