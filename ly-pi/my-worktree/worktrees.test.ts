import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, execFileAsyncMock, realpathSyncMock, statSyncMock } =
  vi.hoisted(() => {
    const execFileMock = vi.fn();
    const execFileAsyncMock = vi.fn();
    Object.defineProperty(
      execFileMock,
      Symbol.for("nodejs.util.promisify.custom"),
      { value: execFileAsyncMock },
    );
    return {
      execFileMock,
      execFileAsyncMock,
      realpathSyncMock: vi.fn(),
      statSyncMock: vi.fn(),
    };
  });

vi.mock("node:child_process", () => ({ execFile: execFileMock }));
vi.mock("node:fs", () => ({
  realpathSync: realpathSyncMock,
  statSync: statSyncMock,
}));

import {
  getVisibleWorktrees,
  parseWorktreeList,
  selectVisibleWorktrees,
} from "./worktrees";

function mockDirectories(paths: readonly string[]) {
  const directories = new Set(paths);
  statSyncMock.mockImplementation((path: string) => {
    if (directories.has(path)) return { isDirectory: () => true };
    throw new Error(`missing directory: ${path}`);
  });
}

function mockGitWorktrees(output: string) {
  execFileAsyncMock.mockResolvedValue({ stdout: output, stderr: "" });
}

function mockGitFailure(message: string) {
  execFileAsyncMock.mockRejectedValue(new Error(message));
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileAsyncMock.mockReset();
  realpathSyncMock.mockReset();
  statSyncMock.mockReset();
  realpathSyncMock.mockImplementation((path: string) => path);
  mockDirectories([]);
});

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

  it("discovers a nested mocked worktree as the only current worktree", async () => {
    const repository = "/repo";
    const featureWorktree = "/repo/.worktree/feature-x";
    const nestedDirectory = `${featureWorktree}/nested`;
    mockDirectories([repository, featureWorktree, nestedDirectory]);
    mockGitWorktrees(
      [
        `worktree ${repository}`,
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        `worktree ${featureWorktree}`,
        "HEAD 2222222222222222222222222222222222222222",
        "branch refs/heads/feature-x",
        "",
      ].join("\n"),
    );

    const snapshot = await getVisibleWorktrees(nestedDirectory);

    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: nestedDirectory, timeout: 3000 },
    );
    expect(snapshot).toEqual({
      repositoryRoot: repository,
      worktrees: [
        { path: repository, label: "main", isCurrent: false },
        { path: featureWorktree, label: "feature-x", isCurrent: true },
      ],
    });
  });

  it("rediscovers from a mocked existing ancestor after nested worktree removal", async () => {
    const repository = "/repo";
    const worktreeDirectory = "/repo/.worktree";
    const featureWorktree = `${worktreeDirectory}/feature-x`;
    const peerWorktree = `${worktreeDirectory}/peer-x`;
    const nestedDirectory = `${featureWorktree}/nested`;
    mockDirectories([repository, worktreeDirectory, peerWorktree]);
    mockGitWorktrees(
      [
        `worktree ${repository}`,
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        `worktree ${peerWorktree}`,
        "HEAD 3333333333333333333333333333333333333333",
        "branch refs/heads/peer-x",
        "",
      ].join("\n"),
    );

    const snapshot = await getVisibleWorktrees(nestedDirectory);

    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: worktreeDirectory, timeout: 3000 },
    );
    expect(snapshot).toEqual({
      repositoryRoot: repository,
      worktrees: [
        { path: repository, label: "main", isCurrent: true },
        { path: peerWorktree, label: "peer-x", isCurrent: false },
      ],
    });
  });

  it("returns null when mocked Git worktree discovery cannot run", async () => {
    mockGitFailure("git unavailable");

    await expect(
      getVisibleWorktrees("/tmp/my-worktree-not-a-repository-99999"),
    ).resolves.toBeNull();
  });
});
