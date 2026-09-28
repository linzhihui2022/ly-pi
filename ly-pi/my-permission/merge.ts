import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ChiefSuggestionItem } from "./chief";
import { appendCost } from "./cost-tracker";
import { formatDiff } from "./diff";
import { auditBinding, createModelClient } from "./model-client";
import { createMerger as createPipelineMerger } from "./pipeline";

export interface MergeAndWriteOptions {
  currentJudgeMd: string;
  operations: Array<string | ChiefSuggestionItem>;
  analysisCost?: number;
  label: string;
  emoji: string;
  costType: "advocate-merge" | "prosecutor-merge" | "chief-merge";
  count: number;
  countLabel: string;
}

/** Shared Phase 2: merge selected operations → confirm → write JUDGE.md */
export async function mergeAndWrite(
  ctx: ExtensionContext,
  opts: MergeAndWriteOptions,
) {
  const merger = createPipelineMerger(createModelClient(ctx), auditBinding);
  const mergeResult = await merger({
    current: opts.currentJudgeMd,
    operations: opts.operations,
  });

  if (mergeResult.error || !mergeResult.mergedText) {
    return {
      content: [
        {
          type: "text" as const,
          text: `融合失败: ${mergeResult.error || "空内容"}`,
        },
      ],
      details: {},
    };
  }

  if (mergeResult.cost !== undefined && mergeResult.modelUsed) {
    appendCost(
      ctx.sessionManager.getSessionId(),
      ctx.cwd,
      opts.costType,
      mergeResult.cost,
      mergeResult.modelUsed,
    );
  }

  const totalCost = (opts.analysisCost ?? 0) + (mergeResult.cost ?? 0);
  ctx.ui.notify(
    `${opts.emoji} ${opts.label}费用: $${totalCost.toFixed(6)} (分析 $${(opts.analysisCost ?? 0).toFixed(6)} + 合并 $${(mergeResult.cost ?? 0).toFixed(6)})`,
    "info",
  );

  const diffBody = formatDiff(opts.currentJudgeMd, mergeResult.mergedText);
  const write = await ctx.ui.confirm(
    `${opts.emoji} ${opts.label}融合完成 — 确认写入？`,
    diffBody,
  );

  if (write) {
    writeFileSync(
      join(process.cwd(), "JUDGE.md"),
      mergeResult.mergedText,
      "utf-8",
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ JUDGE.md 已更新，共 ${opts.count} ${opts.countLabel}`,
        },
      ],
      details: {},
    };
  }

  return {
    content: [{ type: "text" as const, text: "已放弃，JUDGE.md 未修改" }],
    details: {},
  };
}
