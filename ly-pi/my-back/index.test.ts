import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockCommand {
  description: string;
  handler: (
    args: string,
    ctx: ReturnType<typeof createMockCtx>,
  ) => Promise<void> | void;
}

const registeredCommands = new Map<string, MockCommand>();
const mockPi = {
  registerCommand: vi.fn((name: string, options: MockCommand) => {
    registeredCommands.set(name, options);
  }),
};

beforeEach(() => {
  registeredCommands.clear();
  vi.clearAllMocks();
});

async function initExtension() {
  const mod = await import("./index");
  mod.default(mockPi as unknown as ExtensionAPI);
}

function createMockCtx(
  overrides: {
    mode?: "tui" | "rpc" | "json" | "print";
    isIdle?: boolean;
    branch?: Array<{ id: string } & Record<string, unknown>>;
    leafId?: string;
    navigateTreeResult?: { cancelled: boolean };
    navigateTreeError?: Error;
  } = {},
) {
  const branch = overrides.branch ?? [];
  const leafId =
    overrides.leafId ??
    (branch.length > 0 ? branch[branch.length - 1].id : undefined);
  return {
    mode: overrides.mode ?? "tui",
    isIdle: vi.fn(() => overrides.isIdle ?? true),
    ui: {
      notify: vi.fn(),
      setEditorText: vi.fn(),
    },
    sessionManager: {
      getBranch: vi.fn(() => branch),
      getLeafId: vi.fn(() => leafId),
    },
    navigateTree: vi.fn(async () => {
      if (overrides.navigateTreeError) throw overrides.navigateTreeError;
      return overrides.navigateTreeResult ?? { cancelled: false };
    }),
  };
}

describe("my-back extension", () => {
  it("registers /back command", async () => {
    await initExtension();
    expect(mockPi.registerCommand).toHaveBeenCalledWith(
      "back",
      expect.any(Object),
    );
    const command = registeredCommands.get("back");
    expect(command?.description).toBe("撤销最近一条用户消息并放回编辑器");
  });

  it("rejects non-tui mode", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({ mode: "print" });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "/back 仅在交互模式下可用",
      "warning",
    );
    expect(ctx.navigateTree).not.toHaveBeenCalled();
  });

  it("rejects when not idle", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({ isIdle: false });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "请先中断当前操作，再执行 /back",
      "warning",
    );
    expect(ctx.navigateTree).not.toHaveBeenCalled();
  });

  it("notifies when no user message found", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "assistant", content: "hi" },
        },
      ],
    });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("没有可回退的用户消息", "info");
    expect(ctx.navigateTree).not.toHaveBeenCalled();
  });

  it("notifies when user message is already leaf", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "user", content: "hello" },
        },
      ],
      leafId: "a",
    });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "上一条消息之后没有可回退的内容",
      "info",
    );
    expect(ctx.navigateTree).not.toHaveBeenCalled();
  });

  it("navigates tree to last user message", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "user", content: "first" },
        },
        {
          type: "message",
          id: "b",
          message: { role: "assistant", content: "ok" },
        },
        {
          type: "message",
          id: "c",
          message: { role: "user", content: "second" },
        },
      ],
      leafId: "d",
    });
    await command?.handler("", ctx);
    expect(ctx.navigateTree).toHaveBeenCalledWith("c", { summarize: false });
    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("second");
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("notifies when navigateTree is cancelled", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "user", content: "hello" },
        },
      ],
      leafId: "b",
      navigateTreeResult: { cancelled: true },
    });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("已取消回退", "info");
    expect(ctx.ui.setEditorText).not.toHaveBeenCalled();
  });

  it("notifies on navigateTree error", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "user", content: "hello" },
        },
      ],
      leafId: "b",
      navigateTreeError: new Error("boom"),
    });
    await command?.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("boom", "error");
    expect(ctx.ui.setEditorText).not.toHaveBeenCalled();
  });

  it("restores text from content array and notifies about images", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: {
            role: "user",
            content: [
              { type: "text", text: "check this" },
              { type: "image", data: "abc", mimeType: "image/png" },
            ],
          },
        },
      ],
      leafId: "b",
    });
    await command?.handler("", ctx);
    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("check this");
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "图片附件未恢复，仅文本已放回编辑器",
      "info",
    );
  });

  it("ignores extra arguments", async () => {
    await initExtension();
    const command = registeredCommands.get("back");
    const ctx = createMockCtx({
      branch: [
        {
          type: "message",
          id: "a",
          message: { role: "user", content: "hello" },
        },
      ],
      leafId: "b",
    });
    await command?.handler("2", ctx);
    expect(ctx.navigateTree).toHaveBeenCalledWith("a", { summarize: false });
    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("hello");
  });
});
