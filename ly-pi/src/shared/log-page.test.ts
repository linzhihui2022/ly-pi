import { describe, expect, it } from "vitest";
import { renderLogPage } from "./log-page";
import type { LogEntryWithTimestamp } from "./log-page";

function log(
  overrides: Partial<LogEntryWithTimestamp> = {},
): LogEntryWithTimestamp {
  return {
    level: "info",
    source: "test",
    msg: "hello world",
    timestamp: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("renderLogPage", () => {
  it("renders empty state when no logs", () => {
    const html = renderLogPage([]);
    expect(html).toContain("暂无日志记录");
    expect(html).toContain("/ly-log on");
  });

  it("renders a table when logs exist", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("<table>");
    expect(html).not.toContain("暂无日志记录");
  });

  it("shows log count in header", () => {
    const html = renderLogPage([log(), log()]);
    expect(html).toContain("（共 2 条）");
  });

  it("renders log level cell with correct CSS class", () => {
    const html = renderLogPage([log({ level: "debug" })]);
    expect(html).toContain('class="level-debug"');
    expect(html).toContain("DEBUG");
  });

  it("renders all four level styles", () => {
    const html = renderLogPage([
      log({ level: "debug" }),
      log({ level: "info" }),
      log({ level: "warn" }),
      log({ level: "error" }),
    ]);
    expect(html).toContain('class="level-debug"');
    expect(html).toContain('class="level-info"');
    expect(html).toContain('class="level-warn"');
    expect(html).toContain('class="level-error"');
  });

  it("renders source and message in table cells", () => {
    const html = renderLogPage([log({ source: "my-hud", msg: "rendering" })]);
    expect(html).toContain("my-hud");
    expect(html).toContain("rendering");
  });

  it("renders data as formatted JSON code", () => {
    const html = renderLogPage([log({ data: { count: 42 } })]);
    expect(html).toContain("&quot;count&quot;: 42");
  });

  it("renders string data directly", () => {
    const html = renderLogPage([log({ data: "raw string" })]);
    expect(html).toContain("raw string");
  });

  it("shows dash for undefined data", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("<code>—</code>");
  });

  it("renders copy button for each row", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("copyLog(this)");
    expect(html).toContain(">复制<");
  });

  it("includes data-level and data-source attributes for filtering", () => {
    const html = renderLogPage([log({ level: "warn", source: "mod-a" })]);
    expect(html).toContain('data-level="warn"');
    expect(html).toContain('data-source="mod-a"');
  });

  it("renders source filter buttons for unique sources", () => {
    const html = renderLogPage([
      log({ source: "my-hud" }),
      log({ source: "my-permission" }),
      log({ source: "my-hud" }),
    ]);
    expect(html).toContain("setSource('my-hud')");
    expect(html).toContain("setSource('my-permission')");
  });

  it("renders level filter buttons", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("setLevel('all')");
    expect(html).toContain("setLevel('debug')");
    expect(html).toContain("setLevel('info')");
    expect(html).toContain("setLevel('warn')");
    expect(html).toContain("setLevel('error')");
  });

  it("escapes HTML in message", () => {
    const html = renderLogPage([log({ msg: '<script>alert("xss")</script>' })]);
    // The user input <script> should be escaped to &lt;script&gt;
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("escapes HTML in data string", () => {
    const html = renderLogPage([log({ data: "<evil>" })]);
    expect(html).toContain("&lt;evil&gt;");
  });

  it("includes FILTER_JS for client-side filtering", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("function applyFilters()");
    expect(html).toContain("function setLevel(filter)");
    expect(html).toContain("function setSource(filter)");
  });

  it("includes FILTER_JS for copy", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("navigator.clipboard.writeText");
  });

  it("renders full HTML document with DOCTYPE", () => {
    const html = renderLogPage([log()]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"zh-CN\">");
    expect(html).toContain("<title>开发日志</title>");
  });
});
