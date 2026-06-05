// git.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  parsePrUrl,
  isCurrentRepo,
  buildWorktreePath,
  recommendReviewers,
} from "./git";

describe("parsePrUrl", () => {
  it("parses GitHub PR URL", () => {
    const result = parsePrUrl("https://github.com/owner/repo/pull/42");
    expect(result).toEqual({ owner: "owner", repo: "repo", number: 42 });
  });

  it("returns null for invalid URL", () => {
    expect(parsePrUrl("not-a-url")).toBeNull();
    expect(parsePrUrl("https://github.com/owner/repo/issues/42")).toBeNull();
  });
});

describe("isCurrentRepo", () => {
  it("matches when remote contains owner/repo", () => {
    const remotes = `origin  git@github.com:owner/repo.git (fetch)
origin  git@github.com:owner/repo.git (push)`;
    expect(isCurrentRepo(remotes, "owner", "repo")).toBe(true);
  });

  it("does not match different repo", () => {
    const remotes = `origin  git@github.com:other/repo.git (fetch)`;
    expect(isCurrentRepo(remotes, "owner", "repo")).toBe(false);
  });
});

describe("buildWorktreePath", () => {
  it("replaces placeholders", () => {
    const result = buildWorktreePath("{repo}-pr-{number}-review", "myrepo", 42);
    expect(result).toBe("myrepo-pr-42-review");
  });
});

describe("recommendReviewers", () => {
  it("recommends test reviewer for test files", () => {
    const files = [{ path: "src/auth.ts", status: "modified" as const, additions: 10, deletions: 0, hunks: [] },
                   { path: "src/auth.test.ts", status: "modified" as const, additions: 5, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_tests");
  });

  it("recommends type reviewer for .d.ts files", () => {
    const files = [{ path: "src/types.d.ts", status: "added" as const, additions: 20, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_type_design");
  });

  it("always includes quality and simplification for code files", () => {
    const files = [{ path: "src/utils.ts", status: "modified" as const, additions: 1, deletions: 0, hunks: [] }];
    const result = recommendReviewers(files);
    expect(result).toContain("review_code_quality");
    expect(result).toContain("review_simplification");
  });
});
