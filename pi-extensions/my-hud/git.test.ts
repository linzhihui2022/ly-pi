import { describe, it, expect } from "vitest";
import { parseGitStatus } from "./git";

describe("parseGitStatus", () => {
  it("returns clean for repo with no changes", () => {
    const status = parseGitStatus("# branch.oid abc\n# branch.head main\n", "");
    expect(status).toEqual({
      ahead: 0,
      behind: 0,
      staged: 0,
      stashed: 0,
      conflicted: 0,
      isClean: true,
    });
  });

  it("parses ahead count", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +2 -0\n",
      ""
    );
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(0);
    expect(status.isClean).toBe(false);
  });

  it("parses behind count", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +0 -3\n",
      ""
    );
    expect(status.behind).toBe(3);
    expect(status.isClean).toBe(false);
  });

  it("parses diverged", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n# branch.ab +2 -3\n",
      ""
    );
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(3);
    expect(status.isClean).toBe(false);
  });

  it("counts staged files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 M. N... 100644 100644 100644 abc def path1',
      '1 A. N... 100644 100644 100644 abc def path2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(2);
    expect(status.isClean).toBe(false);
  });

  it("counts conflicted files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 UU N... 100644 100644 100644 abc def path1',
      '1 .U N... 100644 100644 100644 abc def path2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.conflicted).toBe(2);
    expect(status.staged).toBe(0);
  });

  it("does not count conflicted as staged", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 AU N... 100644 100644 100644 abc def path1',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.conflicted).toBe(1);
    expect(status.staged).toBe(0);
  });

  it("ignores untracked files", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '1 ?. N... 100644 100644 100644 abc def path1',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(0);
    expect(status.isClean).toBe(true);
  });

  it("counts stashes", () => {
    const status = parseGitStatus(
      "# branch.oid abc\n# branch.head main\n",
      "stash@{0}\nstash@{1}"
    );
    expect(status.stashed).toBe(2);
    expect(status.isClean).toBe(false);
  });

  it("handles rename entries (type 2)", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      '2 R. N... 100644 100644 100644 abc def path1\tpath2',
    ].join("\n");
    const status = parseGitStatus(output, "");
    expect(status.staged).toBe(1);
  });
});