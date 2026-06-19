import { describe, expect, it } from "vitest";
import { type DialogResult, askPermission } from "./dialog.js";
import type { CheckResult } from "./checker.js";

function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    state: "ask",
    origin: "global",
    surface: "tools",
    value: "bash",
    ...overrides,
  };
}

function makeMockUI(selections: (string | undefined)[]) {
  const calls: Array<{ title: string; options: string[] }> = [];
  let index = 0;

  return {
    calls,
    async select(title: string, options: string[]) {
      calls.push({ title, options });
      return selections[index++];
    },
    async input(title: string, _placeholder?: string) {
      calls.push({ title, options: [] });
      return selections[index++];
    },
  };
}

describe("askPermission", () => {
  it("returns allow-once when selected", async () => {
    const ui = makeMockUI(["Allow once"]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("allow-once");
  });

  it("returns allow-session when selected", async () => {
    const ui = makeMockUI(["Allow for this session"]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("allow-session");
  });

  it("returns allow-project when selected", async () => {
    const ui = makeMockUI(["Allow for this project"]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("allow-project");
  });

  it("returns deny when selected", async () => {
    const ui = makeMockUI(["Deny"]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("deny");
  });

  it("returns deny-with-reason when selected and a reason is given", async () => {
    const ui = makeMockUI(["Deny with reason", "sensitive data"]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("deny-with-reason");
    expect((result as DialogResult & { reason: string }).reason).toBe(
      "sensitive data",
    );
  });

  it("returns deny when deny-with-reason is cancelled", async () => {
    const ui = makeMockUI(["Deny with reason", undefined]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("deny");
  });

  it("returns deny when the dialog is cancelled", async () => {
    const ui = makeMockUI([undefined]);
    const result = await askPermission(makeCheckResult(), ui as any);
    expect(result.kind).toBe("deny");
  });

  it("presents a title that includes the surface and value", async () => {
    const ui = makeMockUI(["Deny"]);
    await askPermission(
      makeCheckResult({ surface: "bash", value: "git status" }),
      ui as any,
    );
    expect(ui.calls[0].title).toContain("bash");
    expect(ui.calls[0].title).toContain("git status");
  });
});
