import { describe, expect, it } from "vitest";
import { renderJudgeLogPage } from "./log-page";
import type { JudgeLogEntry } from "./stats";

function createLog(overrides: Partial<JudgeLogEntry> = {}): JudgeLogEntry {
  return {
    decision: "allowed",
    toolName: "bash",
    value: "git status",
    safe: true,
    score: 8,
    reason: "只读操作",
    toolFor: "查看 git 状态",
    ...overrides,
  };
}

describe("renderJudgeLogPage", () => {
  it("renders a complete HTML document titled 法官判断日志", () => {
    const html = renderJudgeLogPage([createLog()]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>法官判断日志</title>");
    expect(html).toContain("</html>");
  });

  it("shows the total count of judge logs", () => {
    const html = renderJudgeLogPage([createLog(), createLog()]);
    expect(html).toContain("当前会话法官判断（共 2 条）");
  });

  it("renders a table row per log with tool, command, verdict, user, toolFor and reason", () => {
    const html = renderJudgeLogPage([createLog()]);
    expect(html).toContain("<td>bash</td>");
    expect(html).toContain("git status");
    expect(html).toContain("✓ 安全（8/10）");
    expect(html).toContain(">—</td>");
    expect(html).toContain("查看 git 状态");
    expect(html).toContain("只读操作");
  });

  it("renders newest log first while keeping chronological numbering", () => {
    const html = renderJudgeLogPage([
      createLog({ toolName: "read", value: "a.txt" }),
      createLog({ toolName: "write", value: "b.txt" }),
    ]);
    const writePos = html.indexOf("b.txt");
    const readPos = html.indexOf("a.txt");
    expect(writePos).toBeLessThan(readPos);
    // chronological numbers: read is #1, write is #2
    const writeRow = html.slice(html.lastIndexOf("<tr", writePos), writePos);
    expect(writeRow).toContain('<td class="num">2</td>');
    const readRow = html.slice(html.lastIndexOf("<tr", readPos), readPos);
    expect(readRow).toContain('<td class="num">1</td>');
  });

  it("renders unsafe verdict with score and user denied", () => {
    const html = renderJudgeLogPage([
      createLog({
        safe: false,
        decision: "denied",
        score: 2,
        userApproved: false,
      }),
    ]);
    expect(html).toContain("✗ 不安全（2/10）");
    expect(html).toContain("✗ 拒绝");
  });

  it("renders unsafe verdict with user approved override", () => {
    const html = renderJudgeLogPage([
      createLog({
        safe: false,
        decision: "denied",
        score: 3,
        userApproved: true,
      }),
    ]);
    expect(html).toContain("✓ 批准");
  });

  it("renders unsafe verdict without score when judge failed", () => {
    const html = renderJudgeLogPage([
      createLog({
        safe: false,
        decision: "denied",
        score: undefined,
        userApproved: false,
      }),
    ]);
    expect(html).toContain("✗ 不安全");
    expect(html).not.toContain("✗ 不安全（");
  });

  it("does not truncate long command values", () => {
    const longValue = "a".repeat(80);
    const html = renderJudgeLogPage([createLog({ value: longValue })]);
    expect(html).toContain(longValue);
  });

  it("escapes HTML in user-controlled content", () => {
    const html = renderJudgeLogPage([
      createLog({
        value: "<script>alert(1)</script>",
        reason: '<b>"reason"</b>',
        toolFor: "x'onlick",
      }),
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;&quot;reason&quot;&lt;/b&gt;");
    expect(html).toContain("x&#39;onlick");
  });

  it("marks rows with data-safe for filtering", () => {
    const html = renderJudgeLogPage([
      createLog({ safe: true }),
      createLog({ safe: false, decision: "denied", userApproved: false }),
    ]);
    expect(html).toContain('data-safe="true"');
    expect(html).toContain('data-safe="false"');
  });

  it("includes 全部/安全/不安全 filter buttons and filter script", () => {
    const html = renderJudgeLogPage([createLog()]);
    expect(html).toContain("全部");
    expect(html).toContain(">安全</button>");
    expect(html).toContain(">不安全</button>");
    expect(html).toContain("function filterLogs(");
  });
});
