import { describe, expect, it } from "vitest";
import { renderCostPage } from "./cost-page";
import type { CostAggregation, SessionSummary } from "./cost-tracker";

function emptyAgg(): CostAggregation {
  return {
    judge: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
    advocate: {
      analysis: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
      merge: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
    },
    prosecutor: {
      analysis: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
      merge: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
    },
    chief: {
      analysis: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
      merge: { totalCost: 0, calls: 0, byModel: {}, daily: {} },
    },
    models: [],
    sessions: [],
    daily: {},
  };
}

describe("renderCostPage", () => {
  it("renders an HTML page with title", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).toContain("法庭成本统计");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("shows zero costs for empty aggregation", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).toContain("¥0.00");
  });

  it("renders all seven role rows in summary table", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).toContain("Judge");
    expect(html).toContain("Advocate (分析)");
    expect(html).toContain("Advocate (合并)");
    expect(html).toContain("Prosecutor (分析)");
    expect(html).toContain("Prosecutor (合并)");
    expect(html).toContain("Chief (分析)");
    expect(html).toContain("Chief (合并)");
  });

  it("renders judge cost and calls", () => {
    const agg = emptyAgg();
    agg.judge.totalCost = 0.001;
    agg.judge.calls = 10;
    agg.judge.byModel["test/model"] = {
      totalCost: 0.001,
      calls: 10,
    };
    const html = renderCostPage(agg);
    expect(html).toContain("¥0.01");
    expect(html).toContain(">10<");
  });

  it("includes CSS in the page", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
  });

  it("shows total row with grand sum", () => {
    const agg = emptyAgg();
    agg.judge.totalCost = 0.001;
    agg.judge.calls = 5;
    agg.advocate.analysis.totalCost = 0.002;
    agg.advocate.analysis.calls = 3;
    const html = renderCostPage(agg);
    expect(html).toContain("总计");
    expect(html).toContain("¥0.02");
  });

  it("renders model table when models exist", () => {
    const agg = emptyAgg();
    agg.models = [
      { model: "test/model-a", totalCost: 0.005, calls: 3 },
      { model: "test/model-c", totalCost: 0.002, calls: 1 },
    ];

    const html = renderCostPage(agg);
    expect(html).toContain("模型分布");
    expect(html).toContain("test/model-a");
    expect(html).toContain("test/model-c");
  });

  it("hides model table when no models", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).not.toContain("模型分布");
  });

  it("renders daily table when daily data exists", () => {
    const agg = emptyAgg();
    agg.daily = {
      "2026-07-23": {
        judge: { totalCost: 0.001, calls: 5 },
        advocate: {
          analysis: { totalCost: 0.002, calls: 1 },
          merge: { totalCost: 0, calls: 0 },
        },
        prosecutor: {
          analysis: { totalCost: 0, calls: 0 },
          merge: { totalCost: 0, calls: 0 },
        },
        chief: {
          analysis: { totalCost: 0, calls: 0 },
          merge: { totalCost: 0, calls: 0 },
        },
        totalCost: 0.003,
        totalCalls: 6,
      },
    };

    const html = renderCostPage(agg);
    expect(html).toContain("每日明细");
    expect(html).toContain("2026-07-23");
    expect(html).toContain("¥0.02"); // 0.003 * 7 = 0.021
  });

  it("hides daily table when no daily data", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).not.toContain("每日明细");
  });

  it("renders session table when sessions exist", () => {
    const agg = emptyAgg();
    agg.sessions = [
      {
        sessionId: "019fa262-959f-7c93-a811-36de8ce4e019",
        judge: { totalCost: 0.001, calls: 10 },
        advocate: {
          analysis: { totalCost: 0, calls: 0 },
          merge: { totalCost: 0, calls: 0 },
        },
        prosecutor: {
          analysis: { totalCost: 0, calls: 0 },
          merge: { totalCost: 0, calls: 0 },
        },
        chief: {
          analysis: { totalCost: 0, calls: 0 },
          merge: { totalCost: 0, calls: 0 },
        },
        totalCost: 0.001,
        totalCalls: 10,
        firstTs: "2026-07-23T10:00:00Z",
        lastTs: "2026-07-23T11:00:00Z",
      },
    ];

    const html = renderCostPage(agg);
    expect(html).toContain("会话明细");
    expect(html).toContain("019fa262"); // short ID (first 8 chars)
  });

  it("hides session table when no sessions", () => {
    const html = renderCostPage(emptyAgg());
    expect(html).not.toContain("会话明细");
  });

  it("shows session count in header", () => {
    const agg = emptyAgg();
    agg.sessions = [makeSession("s1"), makeSession("s2")];

    const html = renderCostPage(agg);
    expect(html).toContain("2 个会话");
  });

  it("truncates session table to last 20", () => {
    const agg = emptyAgg();
    agg.sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession(`s${String(i).padStart(3, "0")}`),
    );

    const html = renderCostPage(agg);
    expect(html).toContain("显示最近 20 条，共 25 条会话");
    // Oldest session excluded, newest included
    expect(html).not.toContain("s000");
    expect(html).not.toContain("s004");
    expect(html).toContain("s024");
  });
});

function makeSession(id: string): SessionSummary {
  return {
    sessionId: id,
    judge: { totalCost: 0, calls: 0 },
    advocate: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    prosecutor: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    chief: {
      analysis: { totalCost: 0, calls: 0 },
      merge: { totalCost: 0, calls: 0 },
    },
    totalCost: 0,
    totalCalls: 0,
    firstTs: "",
    lastTs: "",
  };
}
