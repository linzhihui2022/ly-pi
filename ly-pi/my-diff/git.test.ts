import { describe, expect, it } from "vitest";
import {
  classifyStatusError,
  fetchChangedFiles,
  fetchDiffHead,
  fetchUntrackedContent,
  parseStatusList,
} from "./git";

describe("parseStatusList", () => {
  it("returns empty list for clean tree", () => {
    expect(parseStatusList("")).toEqual([]);
  });

  it("parses unstaged modification as M", () => {
    expect(parseStatusList(" M src/a.ts\n")).toEqual([
      { status: "M", path: "src/a.ts" },
    ]);
  });

  it("parses staged add as A", () => {
    expect(parseStatusList("A  src/new.ts\n")).toEqual([
      { status: "A", path: "src/new.ts" },
    ]);
  });

  it("includes untracked entries as ?", () => {
    expect(parseStatusList("?? src/u.ts\n")).toEqual([
      { status: "?", path: "src/u.ts" },
    ]);
  });

  it("excludes ignored entries", () => {
    expect(parseStatusList("!! build/\n")).toEqual([]);
  });

  it("sorts untracked and tracked entries together by path", () => {
    expect(parseStatusList(" M b.ts\n?? a.ts\n")).toEqual([
      { status: "?", path: "a.ts" },
      { status: "M", path: "b.ts" },
    ]);
  });

  it("maps deleted to M (change vs HEAD)", () => {
    expect(parseStatusList(" D src/gone.ts\n")).toEqual([
      { status: "M", path: "src/gone.ts" },
    ]);
  });

  it("maps rename to M with the new path", () => {
    expect(parseStatusList("R  src/old.ts -> src/new.ts\n")).toEqual([
      { status: "M", path: "src/new.ts" },
    ]);
  });

  it("passes non-ASCII paths through unchanged (git runs with core.quotepath=false)", () => {
    expect(parseStatusList("?? 中文.ts\n")).toEqual([
      { status: "?", path: "中文.ts" },
    ]);
  });

  it("sorts entries by path", () => {
    expect(parseStatusList(" M b.ts\n M a.ts\n")).toEqual([
      { status: "M", path: "a.ts" },
      { status: "M", path: "b.ts" },
    ]);
  });
});

describe("classifyStatusError", () => {
  it("classifies git's not-a-repo fatal as not-repo", () => {
    const err = new Error(
      "Command failed: git ...\nfatal: not a git repository (or any of the parent directories): .git",
    );
    expect(classifyStatusError(err)).toBe("not-repo");
  });

  it("classifies timeouts and other failures as fatal", () => {
    expect(
      classifyStatusError(new Error("Command failed: git ...\nkilled: true")),
    ).toBe("fatal");
  });

  it("classifies non-Error values as fatal", () => {
    expect(classifyStatusError("boom")).toBe("fatal");
    expect(classifyStatusError(undefined)).toBe("fatal");
  });
});

// Wiring tests at the git/fs boundary: inject fakes per mocking.md (DI at
// system boundaries). These lock OUR half of the contract — what command we
// send and how output/errors flow — not git's behavior itself.
describe("fetchChangedFiles wiring", () => {
  const okRun = (stdout: string) => async () => ({ stdout });

  it("sends porcelain status with quotepath disabled in the given cwd", async () => {
    const calls: Array<{ cmd: string; opts: { cwd: string } }> = [];
    const run = async (cmd: string, opts: { cwd: string }) => {
      calls.push({ cmd, opts });
      return { stdout: "" };
    };
    await fetchChangedFiles("/repo", run);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toContain("core.quotepath=false");
    expect(calls[0].cmd).toContain("status --porcelain");
    expect(calls[0].opts.cwd).toBe("/repo");
  });

  it("parses stdout into the changed-file list", async () => {
    const files = await fetchChangedFiles(
      "/repo",
      okRun(" M b.ts\n?? 中文.ts\n"),
    );
    expect(files).toEqual([
      { status: "M", path: "b.ts" },
      { status: "?", path: "中文.ts" },
    ]);
  });

  it("returns null for not-a-repo errors", async () => {
    const run = async () => {
      throw new Error("fatal: not a git repository (or any of the parent)");
    };
    expect(await fetchChangedFiles("/nowhere", run)).toBeNull();
  });

  it("rethrows fatal errors", async () => {
    const run = async () => {
      throw new Error("Command timed out");
    };
    await expect(fetchChangedFiles("/repo", run)).rejects.toThrow(
      "Command timed out",
    );
  });
});

describe("fetchDiffHead wiring", () => {
  it("sends git diff HEAD with the JSON-quoted path", async () => {
    const calls: string[] = [];
    const run = async (cmd: string) => {
      calls.push(cmd);
      return { stdout: "diff-output" };
    };
    const out = await fetchDiffHead("/repo", 'src/sp "ace".ts', run);
    expect(out).toBe("diff-output");
    expect(calls[0]).toContain("git diff HEAD --");
    expect(calls[0]).toContain('"src/sp \\"ace\\".ts"');
  });
});

describe("fetchUntrackedContent wiring", () => {
  it("reads <cwd>/<path> as utf8", async () => {
    const seen: string[] = [];
    const read = async (p: string) => {
      seen.push(p);
      return "file-content";
    };
    const out = await fetchUntrackedContent("/repo", "src/u.ts", read);
    expect(out).toBe("file-content");
    expect(seen[0]).toBe("/repo/src/u.ts");
  });

  it("propagates read failures", async () => {
    const read = async () => {
      throw new Error("ENOENT");
    };
    await expect(
      fetchUntrackedContent("/repo", "gone.ts", read),
    ).rejects.toThrow("ENOENT");
  });
});
