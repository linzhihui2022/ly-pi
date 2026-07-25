import { describe, expect, it } from "vitest";
import { runAllChecks } from "./run";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const HEALTHY = {
  "README.md": "| 扩展 | 功能 |\n| --- | --- |\n| **my-hud** | 状态栏 |",
  "AGENTS.md": "no links",
  "docs/agents/issue-tracker.md": "x",
  "docs/agents/domain.md": "x",
  "docs/agents/triage-labels.md":
    "| a | b | c |\n| --- | --- | --- |\n| `needs-triage` | `needs-triage` | x |",
  "pi-extensions/my-hud/package.json": "{}",
  ".scratch/feat/issues/01-first.md": "**Status:** needs-triage",
};

describe("runAllChecks", () => {
  it("runs all five checks and returns one result per check", () => {
    const results = runAllChecks({
      tree: tree(HEALTHY),
      triageSkillInstalled: true,
    });

    expect(results.map((r) => r.name)).toEqual([
      "extension-table",
      "relative-links",
      "agent-docs",
      "scratch-conventions",
      "no-legacy-docs",
    ]);
    expect(results.every((r) => r.failures.length === 0)).toBe(true);
  });

  it("collects failures from every failing check", () => {
    const results = runAllChecks({
      tree: tree({}),
      triageSkillInstalled: false,
    });
    const byName = new Map(results.map((r) => [r.name, r.failures]));

    expect(byName.get("extension-table")).toEqual(["README.md not found"]);
    expect(byName.get("agent-docs")).toEqual([
      "docs/agents/issue-tracker.md not found",
      "docs/agents/domain.md not found",
    ]);
    expect(byName.get("scratch-conventions")).toEqual([]);
    expect(byName.get("no-legacy-docs")).toEqual([]);
  });
});
