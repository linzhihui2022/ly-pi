import { describe, expect, it, vi } from "vitest";
import { confirmToolCall, createSessionCache, formatConfirmMessage, isChildSession } from "./ui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

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
    expect(stripAnsi(title)).toBe("确认工具调用：bash");
    expect(stripAnsi(body)).toContain("工具：bash");
    expect(stripAnsi(body)).toContain("操作：列出当前目录文件");
    expect(stripAnsi(body)).toContain("输入：ls -la");
    expect(stripAnsi(body)).toContain("工作目录：/repo");
    expect(stripAnsi(body)).toContain("涉及路径：src, dist");
    expect(stripAnsi(body)).toContain("理由：只读取目录内容，相对安全（安全评分：8/10）");
    expect(body).toContain("\x1b[32m");
    expect(body).toContain("\x1b[36m");
    expect(body).toContain("\x1b[33m");
    expect(body).toContain("\x1b[1m");
  });

  it("uses red color for low scores", () => {
    const { body } = formatConfirmMessage({
      toolName: "bash",
      toolFor: "删除文件",
      reason: "危险操作",
      score: 2,
      value: "rm -rf /tmp",
      cwd: "/repo",
      paths: [],
    });
    expect(body).toContain("\x1b[31m");
  });

  it("uses yellow color for medium scores", () => {
    const { body } = formatConfirmMessage({
      toolName: "bash",
      toolFor: "下载文件",
      reason: "网络请求",
      score: 5,
      value: "curl -O https://example.com/file",
      cwd: "/repo",
      paths: [],
    });
    expect(body).toContain("\x1b[33m");
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
    expect(stripAnsi(body)).not.toContain("涉及路径");
    expect(stripAnsi(body)).not.toContain("安全评分");
    expect(stripAnsi(body)).toContain("理由：模型返回格式不正确，请手动确认");
    expect(stripAnsi(title)).toBe("确认工具调用：read");
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
    const calls = (ctx.ui.confirm as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    expect(stripAnsi(calls[0][0])).toBe("确认工具调用：read");
    expect(calls[0][1]).toContain("\x1b[32m");
    expect(stripAnsi(calls[0][1])).toContain("理由：routine read（安全评分：8/10）");
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
