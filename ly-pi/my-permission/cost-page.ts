import { buildHtmlDocument } from "../web-preview/index";
import type { CostAggregation, SessionSummary } from "./cost-tracker";

const CNY = 7;

const PAGE_CSS = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #cdd6f4;
  background: #1e1e2e;
  margin: 0;
  padding: 0;
}
.page-header {
  padding: 1.5rem 1rem 1rem;
  text-align: center;
  border-bottom: 1px solid #313244;
}
.page-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #cba6f7;
  margin: 0 0 0.35rem;
}
.page-header p {
  color: #7f849c;
  font-size: 0.85rem;
  margin: 0;
}
main {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}
.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #cba6f7;
  margin: 2rem 0 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #45475a;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #313244;
  border-radius: 8px;
  overflow: hidden;
}
th, td {
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #313244;
  font-size: 0.85rem;
}
th {
  background: #313244;
  color: #cba6f7;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
td.num {
  color: #7f849c;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
td.cost {
  color: #f38ba8;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
td.total {
  font-weight: 700;
  color: #cba6f7;
}
tbody tr:last-child td {
  border-bottom: none;
}
tbody tr:nth-child(even) td {
  background: #232436;
}
tbody tr:hover td {
  background: #313244;
}
.page-footer {
  text-align: center;
  padding: 1rem 1rem 2rem;
  font-size: 0.8rem;
  color: #7f849c;
  border-top: 1px solid #313244;
  margin-top: 2rem;
}`;

export function renderCostPage(agg: CostAggregation): string {
  return buildHtmlDocument({
    title: "法庭成本统计",
    bodyHtml: [
      renderHeader(agg),
      "  <main>",
      renderSummaryTable(agg),
      renderModelTable(agg),
      renderDailyTable(agg),
      renderSessionTable(agg),
      renderFooter(),
    ].join("\n"),
    css: PAGE_CSS,
  });
}

function renderHeader(agg: CostAggregation): string {
  const total = grandTotal(agg);
  return `  <header class="page-header">
    <h1>法庭成本统计</h1>
    <p>CNY (USD × 7) · ${agg.sessions.length} 个会话 · ${toCny(total.cost)} · ${total.calls} 次调用</p>
  </header>`;
}

function renderSummaryTable(agg: CostAggregation): string {
  const total = grandTotal(agg);
  const rows = buildRoleRows(agg);

  return `    <h2 class="section-title">角色汇总</h2>
    <table>
      <thead>
        <tr><th>角色</th><th>调用次数</th><th>成本</th></tr>
      </thead>
      <tbody>
${rows}
        <tr>
          <td class="num total">总计</td>
          <td class="num total">${total.calls}</td>
          <td class="cost total">${toCny(total.cost)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderModelTable(agg: CostAggregation): string {
  if (agg.models.length === 0) return "";
  const rows = agg.models
    .map(
      (m) =>
        `        <tr>
          <td>${escapeHtml(m.model)}</td>
          <td class="num">${m.calls}</td>
          <td class="cost">${toCny(m.totalCost)}</td>
        </tr>`,
    )
    .join("\n");

  return `    <h2 class="section-title">模型分布</h2>
    <table>
      <thead>
        <tr><th>模型</th><th>调用次数</th><th>成本</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function renderDailyTable(agg: CostAggregation): string {
  const dates = Object.keys(agg.daily).sort();
  if (dates.length === 0) return "";

  const rows = dates
    .map((date) => {
      const d = agg.daily[date];
      return `        <tr>
          <td>${date}</td>
          <td class="num">${d.totalCalls}</td>
          <td class="cost total">${toCny(d.totalCost)}</td>
        </tr>`;
    })
    .join("\n");

  return `    <h2 class="section-title">每日明细</h2>
    <table>
      <thead>
        <tr><th>日期</th><th>调用次数</th><th>成本</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function renderSessionTable(agg: CostAggregation): string {
  if (agg.sessions.length === 0) return "";

  const limit = 20;
  const shown = agg.sessions.slice(-limit);
  const truncated =
    agg.sessions.length > limit
      ? `    <p style="color:#7f849c;font-size:0.8rem;margin:0.5rem 0 0">显示最近 ${limit} 条，共 ${agg.sessions.length} 条会话</p>\n`
      : "";

  const rows = shown.map((s) => renderSessionRow(s)).join("\n");

  return `    <h2 class="section-title">会话明细</h2>\n${truncated}    <table>
      <thead>
        <tr><th>会话</th><th>时间</th><th>Judge</th><th>Advocate</th><th>Prosecutor</th><th>Chief</th><th>调用</th><th>成本</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function renderSessionRow(s: SessionSummary): string {
  const shortId = s.sessionId.slice(0, 8);
  const timeRange = s.firstTs
    ? `${s.firstTs.slice(0, 16)} ~ ${s.lastTs.slice(0, 16)}`
    : "—";
  const advCost = s.advocate.analysis.totalCost + s.advocate.merge.totalCost;
  const prosCost =
    s.prosecutor.analysis.totalCost + s.prosecutor.merge.totalCost;
  const chiefCost = s.chief.analysis.totalCost + s.chief.merge.totalCost;

  return `        <tr>
          <td>${escapeHtml(shortId)}</td>
          <td>${escapeHtml(timeRange)}</td>
          <td class="cost">${toCny(s.judge.totalCost)}</td>
          <td class="cost">${toCny(advCost)}</td>
          <td class="cost">${toCny(prosCost)}</td>
          <td class="cost">${toCny(chiefCost)}</td>
          <td class="num">${s.totalCalls}</td>
          <td class="cost total">${toCny(s.totalCost)}</td>
        </tr>`;
}

function renderFooter(): string {
  return `  </main>
  <footer class="page-footer">Generated by pi · my-permission</footer>`;
}

function buildRoleRows(agg: CostAggregation): string {
  const rows: Array<{ label: string; cost: number; calls: number }> = [
    {
      label: "Judge",
      cost: agg.judge.totalCost,
      calls: agg.judge.calls,
    },
    {
      label: "Advocate (分析)",
      cost: agg.advocate.analysis.totalCost,
      calls: agg.advocate.analysis.calls,
    },
    {
      label: "Advocate (合并)",
      cost: agg.advocate.merge.totalCost,
      calls: agg.advocate.merge.calls,
    },
    {
      label: "Prosecutor (分析)",
      cost: agg.prosecutor.analysis.totalCost,
      calls: agg.prosecutor.analysis.calls,
    },
    {
      label: "Prosecutor (合并)",
      cost: agg.prosecutor.merge.totalCost,
      calls: agg.prosecutor.merge.calls,
    },
    {
      label: "Chief (分析)",
      cost: agg.chief.analysis.totalCost,
      calls: agg.chief.analysis.calls,
    },
    {
      label: "Chief (合并)",
      cost: agg.chief.merge.totalCost,
      calls: agg.chief.merge.calls,
    },
  ];

  return rows
    .map(
      (row) =>
        `        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td class="num">${row.calls}</td>
          <td class="cost">${toCny(row.cost)}</td>
        </tr>`,
    )
    .join("\n");
}

function grandTotal(agg: CostAggregation): { cost: number; calls: number } {
  let cost = 0;
  let calls = 0;
  cost += agg.judge.totalCost;
  calls += agg.judge.calls;
  cost += agg.advocate.analysis.totalCost;
  calls += agg.advocate.analysis.calls;
  cost += agg.advocate.merge.totalCost;
  calls += agg.advocate.merge.calls;
  cost += agg.prosecutor.analysis.totalCost;
  calls += agg.prosecutor.analysis.calls;
  cost += agg.prosecutor.merge.totalCost;
  calls += agg.prosecutor.merge.calls;
  cost += agg.chief.analysis.totalCost;
  calls += agg.chief.analysis.calls;
  cost += agg.chief.merge.totalCost;
  calls += agg.chief.merge.calls;
  return { cost, calls };
}

function toCny(usd: number): string {
  return `¥${(usd * CNY).toFixed(2)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
