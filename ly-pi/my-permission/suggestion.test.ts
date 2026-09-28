import { describe, expect, it } from "vitest";
import { suggestionTypeDetail, suggestionTypeLabel } from "./suggestion";

describe("suggestionTypeLabel", () => {
  it("maps every known suggestion type", () => {
    expect(suggestionTypeLabel("add")).toBe("新增规则");
    expect(suggestionTypeLabel("remove")).toBe("删除规则");
    expect(suggestionTypeLabel("modify")).toBe("改写规则");
    expect(suggestionTypeLabel("merge")).toBe("合并规则");
  });

  it("passes unknown types through", () => {
    expect(suggestionTypeLabel("other")).toBe("other");
  });
});

describe("suggestionTypeDetail", () => {
  it("renders an addition", () => {
    expect(
      suggestionTypeDetail({ type: "add", rule: "R1", reason: "why" }),
    ).toContain("新增: R1");
  });

  it("renders a removal", () => {
    expect(
      suggestionTypeDetail({ type: "remove", rule: "R1", reason: "why" }),
    ).toContain("删除: R1");
  });

  it("renders a rewrite with both rule versions", () => {
    const text = suggestionTypeDetail({
      type: "modify",
      oldRule: "old",
      newRule: "new",
      reason: "why",
    });

    expect(text).toContain("− old");
    expect(text).toContain("+ new");
  });

  it("lists every merged rule", () => {
    const text = suggestionTypeDetail({
      type: "merge",
      oldRules: ["r1", "r2"],
      newRule: "merged",
      reason: "why",
    });

    expect(text).toContain("− r1");
    expect(text).toContain("− r2");
    expect(text).toContain("+ merged");
  });

  it("tolerates a merge without listed rules", () => {
    const text = suggestionTypeDetail({
      type: "merge",
      newRule: "merged",
      reason: "why",
    });

    expect(text).toContain("+ merged");
  });

  it("always appends the reason", () => {
    expect(
      suggestionTypeDetail({ type: "add", rule: "R1", reason: "because" }),
    ).toContain("原因: because");
  });

  it("renders unknown types as reason only", () => {
    const text = suggestionTypeDetail({ type: "other", reason: "because" });

    expect(text).toBe(`\u001b[33m原因: because\u001b[0m`);
  });

  it("substitutes a placeholder for missing rules", () => {
    expect(suggestionTypeDetail({ type: "add", reason: "why" })).toContain(
      "新增: (未提供)",
    );
    expect(suggestionTypeDetail({ type: "remove", reason: "why" })).toContain(
      "删除: (未提供)",
    );

    const modify = suggestionTypeDetail({ type: "modify", reason: "why" });
    expect(modify).toContain("− (未提供)");
    expect(modify).toContain("+ (未提供)");

    expect(suggestionTypeDetail({ type: "merge", reason: "why" })).toContain(
      "+ (未提供)",
    );
  });

  it("never renders undefined for incomplete model output", () => {
    for (const type of ["add", "remove", "modify", "merge", "other"]) {
      expect(suggestionTypeDetail({ type, reason: "why" })).not.toContain(
        "undefined",
      );
    }
  });
});
