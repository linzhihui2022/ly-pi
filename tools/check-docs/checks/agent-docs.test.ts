import { describe, expect, it } from "vitest";
import { checkAgentDocs } from "./agent-docs";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("checkAgentDocs", () => {
  it("passes when the required docs/agents files exist and triage is not installed", () => {
    const t = tree({
      "docs/agents/issue-tracker.md": "x",
      "docs/agents/domain.md": "x",
    });

    expect(checkAgentDocs(t, false)).toEqual([]);
  });

  it("requires triage-labels.md when the triage skill is installed", () => {
    const t = tree({
      "docs/agents/issue-tracker.md": "x",
      "docs/agents/domain.md": "x",
    });

    expect(checkAgentDocs(t, true)).toEqual([
      "docs/agents/triage-labels.md not found (triage skill is installed)",
    ]);
  });

  it("passes with triage installed when triage-labels.md exists", () => {
    const t = tree({
      "docs/agents/issue-tracker.md": "x",
      "docs/agents/domain.md": "x",
      "docs/agents/triage-labels.md": "x",
    });

    expect(checkAgentDocs(t, true)).toEqual([]);
  });

  it("reports every missing required file", () => {
    const t = tree({});

    expect(checkAgentDocs(t, false)).toEqual([
      "docs/agents/issue-tracker.md not found",
      "docs/agents/domain.md not found",
    ]);
  });
});
