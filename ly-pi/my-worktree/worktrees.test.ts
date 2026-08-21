import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleWorktrees,
  parseWorktreeList,
  selectVisibleWorktrees,
} from "./worktrees";

describe("parseWorktreeList", () => {
  it("preserves Git order and represents branch, detached, and prunable entries", () => {
    const output = [
      "worktree /repo/main",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/feature",
      "HEAD abcdef1234567890abcdef1234567890abcdef12",
      "detached",
      "",
      "worktree /repo/gone",
      "HEAD deadbeef1234567890abcdef1234567890abcdef",
      "branch refs/heads/old-feature",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n");

    expect(parseWorktreeList(output)).toEqual([
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/feature",
        branch: null,
        head: "abcdef1234567890abcdef1234567890abcdef12",
        prunable: false,
      },
      {
        path: "/repo/gone",
        branch: "old-feature",
        head: "deadbeef1234567890abcdef1234567890abcdef",
        prunable: true,
      },
    ]);
  });

  it("retains a worktree lock from porcelain output", () => {
    expect(
      parseWorktreeList(
        [
          "worktree /repo/main",
          "HEAD 1111111111111111111111111111111111111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/feature",
          "HEAD 2222222222222222222222222222222222222222",
          "branch refs/heads/feature",
          "locked keep this worktree",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/feature",
        branch: "feature",
        head: "2222222222222222222222222222222222222222",
        prunable: false,
        locked: true,
      },
    ]);
  });

  it("ignores lines that appear before the first worktree record", () => {
    expect(
      parseWorktreeList(
        [
          "unexpected output",
          "worktree /repo/main",
          "HEAD 1111111111111111111111111111111111111111",
          "branch refs/heads/main",
        ].join("\n"),
      ),
    ).toEqual([
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
    ]);
  });

  it("keeps accessible entries in Git order and marks the worktree containing cwd", () => {
    const entries = [
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/feature",
        branch: null,
        head: "abcdef1234567890abcdef1234567890abcdef12",
        prunable: false,
      },
      {
        path: "/repo/gone",
        branch: "old-feature",
        head: "deadbeef1234567890abcdef1234567890abcdef",
        prunable: true,
      },
      {
        path: "/repo/missing",
        branch: "missing",
        head: "2222222222222222222222222222222222222222",
        prunable: false,
      },
    ];

    expect(
      selectVisibleWorktrees(
        entries,
        "/repo/feature/src",
        (path) => path !== "/repo/missing",
      ),
    ).toEqual([
      { path: "/repo/main", label: "main", isCurrent: false },
      { path: "/repo/feature", label: "abcdef1", isCurrent: true },
    ]);
  });

  it("marks only the deepest enclosing worktree as current", () => {
    const entries = [
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/main/.worktree/feature",
        branch: "feature",
        head: "2222222222222222222222222222222222222222",
        prunable: false,
      },
    ];

    expect(
      selectVisibleWorktrees(
        entries,
        "/repo/main/.worktree/feature/src",
        () => true,
      ),
    ).toEqual([
      { path: "/repo/main", label: "main", isCurrent: false },
      {
        path: "/repo/main/.worktree/feature",
        label: "feature",
        isCurrent: true,
      },
    ]);
  });

  it("reselects an enclosing worktree after the nested current worktree becomes inaccessible", () => {
    const entries = [
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/main/.worktree/feature",
        branch: "feature",
        head: "2222222222222222222222222222222222222222",
        prunable: false,
      },
      {
        path: "/repo/peer",
        branch: "peer",
        head: "3333333333333333333333333333333333333333",
        prunable: false,
      },
    ];

    expect(
      selectVisibleWorktrees(
        entries,
        "/repo/main/.worktree/feature/src",
        (path) => path !== "/repo/main/.worktree/feature",
      ),
    ).toEqual([
      { path: "/repo/main", label: "main", isCurrent: true },
      { path: "/repo/peer", label: "peer", isCurrent: false },
    ]);
  });

  it("leaves Current Worktree unresolved when its accessible record has no label", () => {
    const entries = [
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/main/.worktree/feature",
        branch: null,
        head: null,
        prunable: false,
      },
      {
        path: "/repo/peer",
        branch: "peer",
        head: "3333333333333333333333333333333333333333",
        prunable: false,
      },
    ];

    expect(
      selectVisibleWorktrees(
        entries,
        "/repo/main/.worktree/feature/src",
        () => true,
      ),
    ).toEqual([
      { path: "/repo/main", label: "main", isCurrent: false },
      { path: "/repo/peer", label: "peer", isCurrent: false },
    ]);
  });

  it("leaves Current Worktree unresolved when deepest entries are ambiguous", () => {
    const entries = [
      {
        path: "/repo/main",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
        prunable: false,
      },
      {
        path: "/repo/main",
        branch: "duplicate-main",
        head: "2222222222222222222222222222222222222222",
        prunable: false,
      },
      {
        path: "/repo/peer",
        branch: "peer",
        head: "3333333333333333333333333333333333333333",
        prunable: false,
      },
    ];

    expect(
      selectVisibleWorktrees(entries, "/repo/main/src", () => true),
    ).toEqual([
      { path: "/repo/main", label: "main", isCurrent: false },
      {
        path: "/repo/main",
        label: "duplicate-main",
        isCurrent: false,
      },
      { path: "/repo/peer", label: "peer", isCurrent: false },
    ]);
  });

  it("discovers a nested worktree as the only current worktree", async () => {
    const repository = mkdtempSync(join(tmpdir(), "my-worktree-"));
    const featureWorktree = join(repository, ".worktree", "feature-x");

    try {
      execFileSync("git", ["init", "-b", "main", repository]);
      writeFileSync(join(repository, "README.md"), "fixture\n");
      execFileSync("git", ["-C", repository, "add", "README.md"]);
      execFileSync("git", [
        "-C",
        repository,
        "-c",
        "user.name=Test User",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "initial",
      ]);
      mkdirSync(join(repository, ".worktree"));
      execFileSync("git", [
        "-C",
        repository,
        "worktree",
        "add",
        "-b",
        "feature-x",
        featureWorktree,
      ]);
      const nestedDirectory = join(featureWorktree, "nested");
      mkdirSync(nestedDirectory);

      await expect(getVisibleWorktrees(nestedDirectory)).resolves.toEqual({
        repositoryRoot: realpathSync(repository),
        worktrees: [
          { path: realpathSync(repository), label: "main", isCurrent: false },
          {
            path: realpathSync(featureWorktree),
            label: "feature-x",
            isCurrent: true,
          },
        ],
      });
    } finally {
      rmSync(featureWorktree, { recursive: true, force: true });
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it("returns null when Git worktree discovery cannot run", async () => {
    await expect(
      getVisibleWorktrees("/tmp/my-worktree-not-a-repository-99999"),
    ).resolves.toBeNull();
  });
});
