import { writeFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pipeline", () => ({ createMerger: vi.fn() }));
vi.mock("./cost-tracker", () => ({ appendCost: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  writeFileSync: vi.fn(),
}));

import { appendCost } from "./cost-tracker";
import type { MergeAndWriteOptions } from "./merge";
import { mergeAndWrite } from "./merge";
import { createMerger } from "./pipeline";

function createContext(confirm: boolean) {
  const notify = vi.fn();
  const confirmMock = vi.fn().mockResolvedValue(confirm);
  return {
    ctx: {
      cwd: "/repo",
      sessionManager: { getSessionId: () => "session-1" },
      ui: { confirm: confirmMock, notify },
    } as unknown as ExtensionContext,
    confirm: confirmMock,
    notify,
  };
}

const options: MergeAndWriteOptions = {
  currentJudgeMd: "existing rule",
  operations: ["R1"],
  analysisCost: 0.001,
  label: "辩护人",
  emoji: "🎓",
  costType: "advocate-merge",
  count: 1,
  countLabel: "条规则",
};

function mergerReturning(result: unknown) {
  const merger = vi.fn().mockResolvedValue(result);
  vi.mocked(createMerger).mockReturnValue(merger as never);
  return merger;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mergeAndWrite", () => {
  it("refuses to write when the merged text is empty", async () => {
    mergerReturning({ mergedText: "", cost: 0.002, modelUsed: "model" });
    const { ctx } = createContext(true);

    const result = await mergeAndWrite(ctx, options);

    expect(result).toMatchObject({
      content: [{ type: "text", text: "融合失败: 空内容" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(appendCost).not.toHaveBeenCalled();
  });

  it("refuses to write when the merger reports an error", async () => {
    mergerReturning({ error: "boom", mergedText: "ignored" });
    const { ctx } = createContext(true);

    const result = await mergeAndWrite(ctx, options);

    expect(result).toMatchObject({
      content: [{ type: "text", text: "融合失败: boom" }],
    });
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("writes the merged text and records both costs when confirmed", async () => {
    mergerReturning({
      mergedText: "merged rules",
      cost: 0.002,
      modelUsed: "model",
    });
    const { ctx, confirm, notify } = createContext(true);

    const result = await mergeAndWrite(ctx, options);

    expect(appendCost).toHaveBeenCalledWith(
      "session-1",
      "/repo",
      "advocate-merge",
      0.002,
      "model",
    );
    expect(notify).toHaveBeenCalledWith(
      "🎓 辩护人费用: $0.003000 (分析 $0.001000 + 合并 $0.002000)",
      "info",
    );
    expect(confirm).toHaveBeenCalledWith(
      "🎓 辩护人融合完成 — 确认写入？",
      expect.stringContaining("变更预览"),
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("JUDGE.md"),
      "merged rules",
      "utf-8",
    );
    expect(result).toMatchObject({
      content: [{ type: "text", text: "✅ JUDGE.md 已更新，共 1 条规则" }],
    });
  });

  it("keeps JUDGE.md untouched when the confirmation is declined", async () => {
    mergerReturning({
      mergedText: "merged rules",
      cost: 0.002,
      modelUsed: "model",
    });
    const { ctx } = createContext(false);

    const result = await mergeAndWrite(ctx, options);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "已放弃，JUDGE.md 未修改" }],
    });
  });

  it("skips cost bookkeeping without a model name", async () => {
    mergerReturning({ mergedText: "merged rules" });
    const { ctx, notify } = createContext(true);

    await mergeAndWrite(ctx, options);

    expect(appendCost).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      "🎓 辩护人费用: $0.001000 (分析 $0.001000 + 合并 $0.000000)",
      "info",
    );
    expect(writeFileSync).toHaveBeenCalled();
  });
});
