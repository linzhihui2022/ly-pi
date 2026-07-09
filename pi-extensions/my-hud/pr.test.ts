import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseGhPrOutput,
  parseRemoteUrl,
  getPullRequestNumber,
  getRemoteUrl,
} from "./pr";

// Mock child_process for gh CLI and git remote tests
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

import { exec } from "node:child_process";

describe("parseGhPrOutput", () => {
  it("parses number and url from gh JSON output", () => {
    const result = parseGhPrOutput(
      '{"number": 42, "url": "https://github.com/owner/repo/pull/42"}',
    );
    expect(result).toEqual({
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    });
  });

  it("returns null for empty output", () => {
    expect(parseGhPrOutput("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseGhPrOutput("not json")).toBeNull();
  });

  it("returns null when number is missing", () => {
    expect(
      parseGhPrOutput('{"url": "https://github.com/owner/repo/pull/42"}'),
    ).toBeNull();
  });
});

describe("parseRemoteUrl", () => {
  it("parses https URL", () => {
    expect(parseRemoteUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses ssh URL", () => {
    expect(parseRemoteUrl("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns null for non-GitHub URL", () => {
    expect(parseRemoteUrl("https://gitlab.com/owner/repo.git")).toBeNull();
  });

  it("parses https URL without .git suffix", () => {
    expect(parseRemoteUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses ssh URL without .git suffix", () => {
    expect(parseRemoteUrl("git@github.com:owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns null for empty string", () => {
    expect(parseRemoteUrl("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseRemoteUrl("   ")).toBeNull();
  });

  it("returns null for GitHub URL with too few path segments", () => {
    expect(parseRemoteUrl("https://github.com/owner")).toBeNull();
  });
});

describe("getRemoteUrl", () => {
  it("returns tracking remote URL when branch has upstream", async () => {
    vi.mocked(exec).mockImplementation(
      (
        cmd: string,
        _opts: any,
        callback: any,
      ) => {
        if (cmd.includes("branch.feature-x.remote")) {
          callback(null, "upstream\n", "");
        } else if (cmd.includes("remote get-url")) {
          callback(null, "https://github.com/owner/repo.git\n", "");
        } else {
          callback(new Error("unexpected command"), "", "");
        }
        return undefined as any;
      },
    );

    const result = await getRemoteUrl("/x", "feature-x");
    expect(result).toBe("https://github.com/owner/repo.git");
  });

  it("falls back to origin when branch has no tracking remote", async () => {
    vi.mocked(exec).mockImplementation(
      (
        cmd: string,
        _opts: any,
        callback: any,
      ) => {
        if (cmd.includes("branch.feature-x.remote")) {
          callback(null, "\n", ""); // empty -> no tracking
        } else if (cmd.includes("remote get-url")) {
          callback(null, "https://github.com/owner/repo.git\n", "");
        } else {
          callback(new Error("unexpected command"), "", "");
        }
        return undefined as any;
      },
    );

    const result = await getRemoteUrl("/x", "feature-x");
    expect(result).toBe("https://github.com/owner/repo.git");
  });

  it("returns null when git remote get-url fails", async () => {
    vi.mocked(exec).mockImplementation(
      (
        cmd: string,
        _opts: any,
        callback: any,
      ) => {
        if (cmd.includes("branch.feature-x.remote")) {
          callback(null, "upstream\n", "");
        } else if (cmd.includes("remote get-url")) {
          callback(new Error("no such remote"), "", "");
        } else {
          callback(new Error("unexpected command"), "", "");
        }
        return undefined as any;
      },
    );

    const result = await getRemoteUrl("/x", "feature-x");
    expect(result).toBeNull();
  });

  it("returns null when git config returns invalid remote name", async () => {
    vi.mocked(exec).mockImplementation(
      (
        cmd: string,
        _opts: any,
        callback: any,
      ) => {
        if (cmd.includes("branch.feature-x.remote")) {
          callback(new Error("no such config"), "", "");
        } else {
          callback(new Error("unexpected command"), "", "");
        }
        return undefined as any;
      },
    );

    const result = await getRemoteUrl("/x", "feature-x");
    expect(result).toBeNull();
  });
});

describe("getPullRequestNumber", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("returns PR from gh CLI when available", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(
          null,
          '{"number": 42, "url": "https://github.com/owner/repo/pull/42"}',
          "",
        );
        return undefined as any;
      },
    );

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
    );
    expect(result).toEqual({
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
    });
  });

  it("falls back to GitHub API when gh CLI fails", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              number: 7,
              html_url: "https://github.com/owner/repo/pull/7",
            },
          ]),
      }),
    ) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toEqual({
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
    });
  });

  it("falls back to API when gh CLI returns invalid PR JSON", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(null, "{}", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              number: 7,
              html_url: "https://github.com/owner/repo/pull/7",
            },
          ]),
      }),
    ) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toEqual({
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
    });
  });

  it("returns null when both gh and API fail", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() => Promise.reject(new Error("network"))) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toBeNull();
  });

  it("returns null when API returns no PRs", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    ) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toBeNull();
  });

  it("returns null when API responds with non-ok status", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
      }),
    ) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toBeNull();
  });

  it("returns null when API token is missing", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn() as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
    );
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when API returns PR with missing fields", async () => {
    vi.mocked(exec).mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: any,
      ) => {
        callback(new Error("gh not found"), "", "");
        return undefined as any;
      },
    );

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              url: "https://github.com/owner/repo/pull/7",
            },
          ]),
      }),
    ) as any;

    const result = await getPullRequestNumber(
      "/x",
      "feature-x",
      "owner",
      "repo",
      "token",
    );
    expect(result).toBeNull();
  });
});
