import { describe, expect, it } from "vitest";
import {
  expandHome,
  extractPathTokens,
  isExternalPath,
  resolvePath,
  splitBashCommandUnits,
  stripEnvPrefix,
} from "./utils";

describe("expandHome", () => {
  it("expands leading tilde", () => {
    const home = process.env.HOME ?? "/tmp";
    expect(expandHome("~/.ssh/id_rsa")).toBe(`${home}/.ssh/id_rsa`);
  });

  it("expands bare tilde", () => {
    const home = process.env.HOME ?? "/tmp";
    expect(expandHome("~")).toBe(home);
  });

  it("leaves non-tilde paths unchanged", () => {
    expect(expandHome("/etc/passwd")).toBe("/etc/passwd");
  });
});

describe("resolvePath", () => {
  it("resolves relative path against cwd", () => {
    expect(resolvePath("src", "/home/user/project")).toBe(
      "/home/user/project/src",
    );
  });

  it("resolves absolute path directly", () => {
    expect(resolvePath("/tmp", "/home/user/project")).toBe("/tmp");
  });
});

describe("splitBashCommandUnits", () => {
  it("splits by &&, |, ;, and newline", () => {
    expect(
      splitBashCommandUnits("cd /tmp; cat file | grep x && echo done"),
    ).toEqual(["cd /tmp", "cat file", "grep x", "echo done"]);
  });

  it("keeps quoted operators as one unit", () => {
    expect(splitBashCommandUnits('echo "a && b"')).toEqual(['echo "a && b"']);
  });

  it("handles single-quoted strings", () => {
    expect(splitBashCommandUnits("echo 'a && b'")).toEqual(["echo 'a && b'"]);
  });

  it("splits by newlines", () => {
    expect(splitBashCommandUnits("echo hello\necho world")).toEqual([
      "echo hello",
      "echo world",
    ]);
  });

  it("handles trailing operator gracefully", () => {
    expect(splitBashCommandUnits("echo hello && ")).toEqual(["echo hello"]);
  });
});

describe("stripEnvPrefix", () => {
  it("strips environment variable prefix", () => {
    expect(stripEnvPrefix("AWS_PROFILE=prod aws s3 ls")).toBe("aws s3 ls");
  });

  it("strips prefix with longer variable name", () => {
    expect(stripEnvPrefix("PGPASSWORD=secret psql -c query")).toBe(
      "psql -c query",
    );
  });

  it("leaves bare commands unchanged", () => {
    expect(stripEnvPrefix("echo hello")).toBe("echo hello");
  });
});

describe("isExternalPath", () => {
  it("returns true for paths outside cwd", () => {
    expect(isExternalPath("/tmp", "/home")).toBe(true);
  });

  it("returns false for paths inside cwd", () => {
    expect(isExternalPath("/home/user/project/src", "/home/user/project")).toBe(
      false,
    );
  });

  it("returns true for tilde path outside cwd", () => {
    const _home = process.env.HOME ?? "/tmp";
    expect(isExternalPath("~/.ssh", "/home/user/project")).toBe(true);
  });

  it("resolves relative path against cwd", () => {
    expect(isExternalPath("../outside", "/home/user/project")).toBe(true);
  });
});

describe("extractPathTokens", () => {
  it("finds relative, absolute, and dotfile tokens", () => {
    const tokens = extractPathTokens(
      "cat src/main.ts ~/.env .envrc id_rsa",
      "/cwd",
    );
    expect(tokens).toContain("src/main.ts");
    expect(tokens).toContain("~/.env");
    expect(tokens).toContain("id_rsa");
  });

  it("includes dotfile tokens", () => {
    const tokens = extractPathTokens("cat .env", "/cwd");
    expect(tokens).toContain(".env");
  });

  it("excludes flags", () => {
    const tokens = extractPathTokens("ls --all -la", "/cwd");
    expect(tokens).not.toContain("--all");
    expect(tokens).not.toContain("-la");
  });
});
