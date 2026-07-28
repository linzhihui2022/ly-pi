import { buildHtmlDocument } from "../../web-preview/index";
import type { LogEntry } from "./logger";

export interface LogEntryWithTimestamp extends LogEntry {
  timestamp: string;
}

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
  margin: 0 0 0.9rem;
}
.filters {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.filter-btn {
  background: #313244;
  border: 1px solid #45475a;
  color: #a6adc8;
  padding: 4px 16px;
  border-radius: 999px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.filter-btn:hover {
  background: #45475a;
}
.filter-btn.active {
  background: #cba6f7;
  border-color: #cba6f7;
  color: #1e1e2e;
  font-weight: 600;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.filter-label {
  color: #7f849c;
  font-size: 0.8rem;
}
main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
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
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #313244;
}
th {
  background: #313244;
  color: #cba6f7;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
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
td.num {
  color: #7f849c;
  white-space: nowrap;
}
td.time {
  color: #a6adc8;
  white-space: nowrap;
  font-size: 0.85em;
}
td.level-debug { color: #7f849c; font-weight: 600; white-space: nowrap; }
td.level-info  { color: #89b4fa; font-weight: 600; white-space: nowrap; }
td.level-warn  { color: #f9e2af; font-weight: 600; white-space: nowrap; }
td.level-error { color: #f38ba8; font-weight: 600; white-space: nowrap; }
td.source {
  color: #cba6f7;
  white-space: nowrap;
  font-size: 0.85em;
}
td.message {
  color: #cdd6f4;
  word-break: break-all;
}
td.data-cell {
  max-width: 300px;
  overflow: hidden;
}
td.data-cell code {
  background: #11111b;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 2px 6px;
  color: #94e2d5;
  font-size: 0.8em;
  white-space: pre-wrap;
  word-break: break-all;
}
td.actions {
  white-space: nowrap;
}
.copy-btn {
  background: #45475a;
  border: 1px solid #585b70;
  color: #cdd6f4;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}
.copy-btn:hover {
  background: #585b70;
}
.copy-btn.copied {
  background: #a6e3a1;
  border-color: #a6e3a1;
  color: #1e1e2e;
}
.action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.action-btn {
  background: #45475a;
  border: 1px solid #585b70;
  color: #cdd6f4;
  padding: 5px 16px;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}
.action-btn:hover {
  background: #585b70;
}
.action-btn.copied {
  background: #a6e3a1;
  border-color: #a6e3a1;
  color: #1e1e2e;
}
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #7f849c;
}
.page-footer {
  text-align: center;
  padding: 1rem 1rem 2rem;
  font-size: 0.8rem;
  color: #7f849c;
  border-top: 1px solid #313244;
}`;

const FILTER_JS = `var activeLevel = 'all';
var activeSource = 'all';

function applyFilters() {
  var rows = document.querySelectorAll('tbody tr');
  for (var i = 0; i < rows.length; i++) {
    var level = rows[i].dataset.level;
    var source = rows[i].dataset.source;
    var levelMatch = activeLevel === 'all' || level === activeLevel;
    var sourceMatch = activeSource === 'all' || source === activeSource;
    rows[i].style.display = (levelMatch && sourceMatch) ? '' : 'none';
  }
}

function setLevel(filter) {
  activeLevel = filter;
  var buttons = document.querySelectorAll('#level-filters .filter-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].dataset.filter === filter);
  }
  applyFilters();
}

function setSource(filter) {
  activeSource = filter;
  var buttons = document.querySelectorAll('#source-filters .filter-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].dataset.filter === filter);
  }
  applyFilters();
}

function copyLog(btn) {
  var row = btn.closest('tr');
  var timestamp = row.dataset.timestamp;
  var level = row.dataset.level;
  var source = row.dataset.source;
  var msg = row.dataset.msg;
  var dataText = row.dataset.rawdata || '';

  var text = '[' + timestamp + '] [' + level.toUpperCase() + '] ' + source + ': ' + msg;
  if (dataText) {
    text += '\\n' + dataText;
  }

  navigator.clipboard.writeText(text).then(function() {
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(function() {
      btn.textContent = '复制';
      btn.classList.remove('copied');
    }, 1500);
  });
}

function collectJson(rows) {
  var entries = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var entry = {
      timestamp: row.dataset.timestamp,
      level: row.dataset.level,
      source: row.dataset.source,
      msg: row.dataset.msg
    };
    if (row.dataset.rawdata) {
      try {
        entry.data = JSON.parse(row.dataset.rawdata);
      } catch (e) {
        entry.data = row.dataset.rawdata;
      }
    }
    entries.push(entry);
  }
  return entries;
}

function copyAllLogs(btn) {
  var rows = document.querySelectorAll('tbody tr');
  var json = JSON.stringify(collectJson(rows), null, 2);
  navigator.clipboard.writeText(json).then(function() {
    btn.textContent = '已复制 (' + rows.length + ' 条)';
    btn.classList.add('copied');
    setTimeout(function() {
      btn.textContent = '复制全部';
      btn.classList.remove('copied');
    }, 1500);
  });
}

function copyFilteredLogs(btn) {
  var rows = document.querySelectorAll('tbody tr');
  var visible = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].style.display !== 'none') {
      visible.push(rows[i]);
    }
  }
  var json = JSON.stringify(collectJson(visible), null, 2);
  navigator.clipboard.writeText(json).then(function() {
    btn.textContent = '已复制 (' + visible.length + ' 条)';
    btn.classList.add('copied');
    setTimeout(function() {
      btn.textContent = '复制筛选结果';
      btn.classList.remove('copied');
    }, 1500);
  });
}`;

function renderLevelCell(level: string): string {
  const labels: Record<string, string> = {
    debug: "DEBUG",
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
  };
  return `<td class="level-${level}">${labels[level] ?? level.toUpperCase()}</td>`;
}

function renderDataCell(data: unknown): string {
  if (data === undefined || data === null) {
    return '<td class="data-cell"><code>—</code></td>';
  }
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return `<td class="data-cell"><code>${escapeHtml(text)}</code></td>`;
}

function renderRow(log: LogEntryWithTimestamp, num: number): string {
  const rawData =
    log.data !== undefined
      ? typeof log.data === "string"
        ? log.data
        : JSON.stringify(log.data, null, 2)
      : "";

  return `        <tr
          data-level="${escapeAttr(log.level)}"
          data-source="${escapeAttr(log.source)}"
          data-timestamp="${escapeAttr(log.timestamp)}"
          data-msg="${escapeAttr(log.msg)}"
          data-rawdata="${escapeAttr(rawData)}">
          <td class="num">${num}</td>
          <td class="time">${escapeHtml(log.timestamp)}</td>
          ${renderLevelCell(log.level)}
          <td class="source">${escapeHtml(log.source)}</td>
          <td class="message">${escapeHtml(log.msg)}</td>
          ${renderDataCell(log.data)}
          <td class="actions"><button class="copy-btn" onclick="copyLog(this)">复制</button></td>
        </tr>`;
}

function collectSources(logs: LogEntryWithTimestamp[]): string[] {
  const seen = new Set<string>();
  for (const log of logs) {
    seen.add(log.source);
  }
  return [...seen].sort();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderLogPage(logs: LogEntryWithTimestamp[]): string {
  const rows = logs.map((log, index) => renderRow(log, index + 1)).join("\n");
  const sources = collectSources(logs);

  const sourceFilters = sources
    .map(
      (s) =>
        `        <button class="filter-btn" data-filter="${escapeAttr(s)}" onclick="setSource('${escapeAttr(s)}')">${escapeHtml(s)}</button>`,
    )
    .join("\n");

  const bodyContent =
    logs.length === 0
      ? `  <main>
    <div class="empty-state">暂无日志记录。使用 /ly-log on 开启日志。</div>
  </main>`
      : `  <header class="page-header">
    <h1>开发日志</h1>
    <p>当前会话日志（共 ${logs.length} 条）</p>
    <div class="filters">
      <div class="filter-group">
        <span class="filter-label">级别:</span>
        <div id="level-filters">
          <button class="filter-btn active" data-filter="all" onclick="setLevel('all')">全部</button>
          <button class="filter-btn" data-filter="debug" onclick="setLevel('debug')">DEBUG</button>
          <button class="filter-btn" data-filter="info" onclick="setLevel('info')">INFO</button>
          <button class="filter-btn" data-filter="warn" onclick="setLevel('warn')">WARN</button>
          <button class="filter-btn" data-filter="error" onclick="setLevel('error')">ERROR</button>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">来源:</span>
        <div id="source-filters">
          <button class="filter-btn active" data-filter="all" onclick="setSource('all')">全部</button>
${sourceFilters}
        </div>
      </div>
    </div>
  </header>
  <main>
    <div class="action-bar">
      <button class="action-btn" onclick="copyAllLogs(this)">复制全部</button>
      <button class="action-btn" onclick="copyFilteredLogs(this)">复制筛选结果</button>
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>时间</th><th>级别</th><th>来源</th><th>消息</th><th>数据</th><th></th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </main>`;

  return buildHtmlDocument({
    title: "开发日志",
    bodyHtml: bodyContent,
    css: PAGE_CSS,
    js: FILTER_JS,
  });
}
