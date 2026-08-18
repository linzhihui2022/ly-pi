import { describe, expect, it } from "vitest";
import { stripRedundantCd } from "./detector";

const CWD = "/Users/alice/Documents/configure";

describe("stripRedundantCd", () => {
  it("strips a leading cd to the session cwd joined by &&", () => {
    const result = stripRedundantCd(`cd ${CWD} && git status`, CWD);
    expect(result).toEqual({
      command: "git status",
      stripped: `cd ${CWD} && `,
    });
  });

  it("strips a leading cd joined by semicolon", () => {
    const result = stripRedundantCd(`cd ${CWD}; git status`, CWD);
    expect(result?.command).toBe("git status");
  });

  it("strips a quoted cd target", () => {
    expect(stripRedundantCd(`cd "${CWD}" && ls`, CWD)?.command).toBe("ls");
    expect(stripRedundantCd(`cd '${CWD}' && ls`, CWD)?.command).toBe("ls");
  });

  it("tolerates a trailing slash on the cd target", () => {
    expect(stripRedundantCd(`cd ${CWD}/ && ls`, CWD)?.command).toBe("ls");
  });

  it("treats cd . and cd ./ as the session cwd", () => {
    expect(stripRedundantCd("cd . && ls", CWD)?.command).toBe("ls");
    expect(stripRedundantCd("cd ./ && ls", CWD)?.command).toBe("ls");
  });

  it("leaves a cd to a different directory untouched", () => {
    expect(stripRedundantCd("cd /tmp && ls", CWD)).toBeUndefined();
    expect(stripRedundantCd("cd .. && ls", CWD)).toBeUndefined();
  });

  it("leaves commands without a leading cd untouched", () => {
    expect(stripRedundantCd("git status", CWD)).toBeUndefined();
    expect(stripRedundantCd(`cdx ${CWD} && ls`, CWD)).toBeUndefined();
  });

  it("leaves a mid-command cd untouched", () => {
    expect(stripRedundantCd(`ls && cd ${CWD} && pwd`, CWD)).toBeUndefined();
  });

  it("rewrites a bare cd to the cwd as a no-op", () => {
    const result = stripRedundantCd(`cd ${CWD}`, CWD);
    expect(result).toEqual({ command: "true", stripped: `cd ${CWD}` });
  });

  it("resolves symlinks on both sides via the injected realpath", () => {
    const realpath = (p: string) => (p === "/tmp" ? "/private/tmp" : p);
    const result = stripRedundantCd("cd /tmp && ls", "/private/tmp", realpath);
    expect(result?.command).toBe("ls");
  });

  it("treats an unresolvable cd target as not redundant", () => {
    const realpath = (p: string) => {
      if (p === "/gone") throw new Error("ENOENT");
      return p;
    };
    expect(stripRedundantCd("cd /gone && ls", CWD, realpath)).toBeUndefined();
  });

  it("handles a root-directory target without trimming it away", () => {
    expect(stripRedundantCd("cd / && ls", "/")?.command).toBe("ls");
  });
});
