import { describe, expect, it, vi } from "vitest";
import { confirmToolCall, createSessionCache, formatConfirmMessage, isChildSession } from "./ui";
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

describe("formatConfirmMessage", () => {
  it("formats a Chinese confirmation with score and paths", () => {
    const { title, body } = formatConfirmMessage({
      toolName: "bash",
      toolFor: "列出当前目录文件",
      reason: "只读取目录内容，相对安全",
      score: 8,
      value: "ls -la",
      cwd: "/repo",
      paths: ["src", "dist"],
    });
    expect(title).toBe("确认工具调用：bash");
    expect(body).toContain("工具：bash");
    expect(body).toContain("操作：列出当前目录文件");
    expect(body).toContain("输入：ls -la");
    expect(body).toContain("工作目录：/repo");
    expect(body).toContain("涉及路径：src, dist");
    expect(body).toContain("理由：只读取目录内容，相对安全（安全评分：8/10）");
  });

  it("omits paths when empty and omits score when undefined", () => {
    const { title, body } = formatConfirmMessage({
      toolName: "read",
      toolFor: "读取文件",
      reason: "模型返回格式不正确，请手动确认",
      value: "src/main.ts",
      cwd: "/repo",
      paths: [],
    });
    expect(body).not.toContain("涉及路径");
    expect(body).not.toContain("安全评分");
    expect(body).toContain("理由：模型返回格式不正确，请手动确认");
  });
});

describe("confirmToolCall", () => {
  it("returns true when user confirms", async () => {
    const ctx = mockCtx(true);
    const ok = await confirmToolCall(ctx, {
      toolName: "read",
      toolFor: "read src/main.ts",
      reason: "routine read",
      score: 8,
      value: "src/main.ts",
      cwd: "/repo",
      paths: [],
    });
    expect(ok).toBe(true);
    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "确认工具调用：read",
      expect.stringContaining("理由：routine read（安全评分：8/10）"),
    );
  });

  it("returns false when user denies", async () => {
    const ctx = mockCtx(false);
    const ok = await confirmToolCall(ctx, {
      toolName: "read",
      toolFor: "read src/main.ts",
      reason: "routine read",
      value: "src/main.ts",
      cwd: "/repo",
      paths: [],
    });
    expect(ok).toBe(false);
  });

  it("returns false when hasUI is false", async () => {
    const ctx = {
      hasUI: false,
      ui: { confirm: vi.fn() },
    } as unknown as ExtensionContext;
    const ok = await confirmToolCall(ctx, {
      toolName: "bash",
      toolFor: "rm -rf /",
      reason: "dangerous",
      value: "rm -rf /",
      cwd: "/repo",
      paths: [],
    });
    expect(ok).toBe(false);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
  });
});
