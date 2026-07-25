import { describe, expect, it } from "vitest";
import { checkScratchConventions } from "./scratch-conventions";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const LABELS = [
  "# Triage Labels",
  "",
  "| Label in mattpocock/skills | Label in our tracker | Meaning |",
  "| --- | --- | --- |",
  "| `needs-triage` | `needs-triage` | x |",
  "| `ready-for-agent` | `ready-for-agent` | x |",
  "|",
].join("\n");

describe("checkScratchConventions", () => {
  it("passes when issue files follow the numbering and status conventions", () => {
    const t = tree({
      "docs/agents/triage-labels.md": LABELS,
      ".scratch/feat/issues/01-first.md":
        "# 01 — First\n\n**Status:** ready-for-agent\n",
      ".scratch/feat/issues/02-second.md":
        "# 02 — Second\n\n**Status:** claimed\n",
    });

    expect(checkScratchConventions(t)).toEqual([]);
  });

  it("accepts resolved as a status", () => {
    const t = tree({
      "docs/agents/triage-labels.md": LABELS,
      ".scratch/feat/issues/01-first.md": "Status: resolved",
    });

    expect(checkScratchConventions(t)).toEqual([]);
  });

  it("rejects issue files whose names do not match NN-slug", () => {
    const t = tree({
      "docs/agents/triage-labels.md": LABELS,
      ".scratch/feat/issues/first.md": "**Status:** claimed",
    });

    expect(checkScratchConventions(t)).toEqual([
      ".scratch/feat/issues/first.md does not match the NN-slug.md naming convention",
    ]);
  });

  it("rejects issue files without a Status line", () => {
    const t = tree({
      "docs/agents/triage-labels.md": LABELS,
      ".scratch/feat/issues/01-first.md": "# 01 — First\n\nNo status here.",
    });

    expect(checkScratchConventions(t)).toEqual([
      ".scratch/feat/issues/01-first.md has no Status line",
    ]);
  });

  it("rejects status values outside the triage vocabulary", () => {
    const t = tree({
      "docs/agents/triage-labels.md": LABELS,
      ".scratch/feat/issues/01-first.md": "**Status:** in-progress",
    });

    expect(checkScratchConventions(t)).toEqual([
      ".scratch/feat/issues/01-first.md has unknown status: in-progress",
    ]);
  });

  it("uses the right-hand label column from triage-labels.md", () => {
    const t = tree({
      "docs/agents/triage-labels.md":
        "| a | b | c |\n| --- | --- | --- |\n| `needs-triage` | `bug:triage` | x |",
      ".scratch/feat/issues/01-first.md": "**Status:** bug:triage",
      ".scratch/feat/issues/02-second.md": "**Status:** needs-triage",
    });

    expect(checkScratchConventions(t)).toEqual([
      ".scratch/feat/issues/02-second.md has unknown status: needs-triage",
    ]);
  });

  it("falls back to claimed/resolved only when triage-labels.md is missing", () => {
    const t = tree({
      ".scratch/feat/issues/01-first.md": "**Status:** ready-for-agent",
      ".scratch/feat/issues/02-second.md": "**Status:** resolved",
    });

    expect(checkScratchConventions(t)).toEqual([
      ".scratch/feat/issues/01-first.md has unknown status: ready-for-agent",
    ]);
  });

  it("ignores files outside .scratch/*/issues/", () => {
    const t = tree({
      ".scratch/feat/spec.md": "Status: whatever",
      ".scratch/feat/map.md": "no status",
    });

    expect(checkScratchConventions(t)).toEqual([]);
  });
});
