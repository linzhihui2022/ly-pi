import { describe, expect, it } from "vitest";
import {
  decide,
  evaluateExternalDirectoryLayer,
  evaluatePathLayer,
  evaluateRuleMap,
  evaluateRuleMapMany,
  evaluateSurfaceLayer,
  matchPattern,
  mergeVerdicts,
  toVerdict,
} from "./rules";
import type { Config, PermissionMap } from "./types";

function cfg(
  permission: Config["permission"],
  defaultPolicy: Config["defaultPolicy"] = "ask",
): Config {
  return {
    defaultPolicy,
    judgeModel: "deepseek/deepseek-v4-flash",
    auditModel: "deepseek/deepseek-v4-flash",
    auditThinking: "low",
    judgeTimeoutMs: 8000,
    childPolicy: "deny-on-unsafe",
    permission,
  };
}

describe("matchPattern", () => {
  it("matches wildcard to everything", () => {
    expect(matchPattern("*", "anything")).toBe(true);
  });

  it("matches end wildcard", () => {
    expect(matchPattern("rm *", "rm -rf /")).toBe(true);
    expect(matchPattern("rm *", "git status")).toBe(false);
  });

  it("matches exact string", () => {
    expect(matchPattern("git status", "git status")).toBe(true);
    expect(matchPattern("git status", "git status --long")).toBe(false);
  });

  it("matches single char wildcard", () => {
    expect(matchPattern("file.???", "file.env")).toBe(true);
    expect(matchPattern("file.???", "file.en")).toBe(false);
    expect(matchPattern("file.???", "file.envx")).toBe(false);
  });

  it("expands tilde before matching", () => {
    expect(matchPattern("~/.ssh/*", `${process.env.HOME}/.ssh/id_rsa`)).toBe(
      true,
    );
  });
});

describe("toVerdict", () => {
  it("converts string rule", () => {
    const v = toVerdict("allow", "*", "read");
    expect(v).toEqual({ action: "allow", matchedPattern: "*", source: "read" });
  });

  it("converts deny with reason", () => {
    const v = toVerdict(
      { action: "deny", reason: "Use pnpm" },
      "npm *",
      "bash",
    );
    expect(v).toEqual({
      action: "deny",
      reason: "Use pnpm",
      matchedPattern: "npm *",
      source: "bash",
    });
  });
});

describe("evaluateRuleMap", () => {
  it("returns undefined when no pattern matches", () => {
    const v = evaluateRuleMap("cat x", { "rm *": "deny" }, "bash");
    expect(v).toBeUndefined();
  });

  it("returns last matching rule", () => {
    const v = evaluateRuleMap(
      "rm -rf /tmp",
      { "rm *": "deny", "rm -rf *": "allow" },
      "bash",
    );
    expect(v?.action).toBe("allow");
  });
});

describe("evaluateRuleMapMany", () => {
  it("takes most restrictive across values", () => {
    const rules: PermissionMap = { "*.ts": "allow", "*.env": "deny" };
    const v = evaluateRuleMapMany(["src/a.ts", "src/.env"], rules, "path");
    expect(v?.action).toBe("deny");
  });
});

describe("mergeVerdicts", () => {
  it("returns undefined for empty input", () => {
    expect(mergeVerdicts()).toBeUndefined();
  });

  it("filters out undefined verdicts", () => {
    expect(
      mergeVerdicts(undefined, { action: "allow" }, undefined)?.action,
    ).toBe("allow");
  });

  it("chooses deny over ask and allow", () => {
    const v = mergeVerdicts(
      { action: "allow", source: "read" },
      { action: "deny", source: "path" },
      { action: "ask", source: "external_directory" },
    );
    expect(v?.action).toBe("deny");
  });

  it("chooses ask over allow", () => {
    const v = mergeVerdicts(
      { action: "allow", source: "read" },
      { action: "ask", source: "external_directory" },
    );
    expect(v?.action).toBe("ask");
  });
});

describe("evaluatePathLayer", () => {
  it("denies matched path pattern", () => {
    const v = evaluatePathLayer(
      ["src/.env"],
      { "*": "allow", "*.env": "deny" },
      "/repo",
    );
    expect(v?.action).toBe("deny");
  });

  it("allows non-matching paths", () => {
    const v = evaluatePathLayer(
      ["src/main.ts"],
      { "*.env": "deny", "*": "allow" },
      "/repo",
    );
    expect(v?.action).toBe("allow");
  });
});

describe("evaluateExternalDirectoryLayer", () => {
  it("returns undefined when no paths are external", () => {
    const cwd = "/repo";
    const v = evaluateExternalDirectoryLayer(
      ["src/main.ts", "package.json"],
      { "*": "ask" },
      cwd,
    );
    expect(v).toBeUndefined();
  });

  it("evaluates rules for external paths", () => {
    const v = evaluateExternalDirectoryLayer(
      ["../foo.txt"],
      { "*": "ask" },
      "/repo",
    );
    expect(v?.action).toBe("ask");
  });

  it("allows specific external directory", () => {
    const v = evaluateExternalDirectoryLayer(
      ["/tmp/cache/file"],
      { "*": "ask", "/tmp/cache/*": "allow" },
      "/repo",
    );
    expect(v?.action).toBe("allow");
  });
});

describe("evaluateSurfaceLayer", () => {
  it("handles string rule value", () => {
    const v = evaluateSurfaceLayer(
      { toolName: "read", value: "anything", paths: [] },
      "allow",
      "/repo",
    );
    expect(v?.action).toBe("allow");
  });

  it("splits bash commands and takes most restrictive", () => {
    const v = evaluateSurfaceLayer(
      { toolName: "bash", value: "echo hello && rm foo", paths: [] },
      { "rm *": "deny", "echo *": "allow" },
      "/repo",
    );
    expect(v?.action).toBe("deny");
  });

  it("handles non-bash tool with permission map", () => {
    const v = evaluateSurfaceLayer(
      { toolName: "mcp", value: "mcp_status", paths: [] },
      { "*": "ask", mcp_status: "allow" },
      "/repo",
    );
    expect(v?.action).toBe("allow");
  });

  it("returns ask when no bash pattern matches a command unit", () => {
    const v = evaluateSurfaceLayer(
      { toolName: "bash", value: "ls file.txt", paths: [] },
      { "cat *": "allow", "rm *": "deny" },
      "/repo",
    );
    expect(v?.action).toBe("ask");
    expect(v?.source).toBe("bash");
  });
});

describe("decide", () => {
  it("allows read inside cwd by default when read: allow", () => {
    const v = decide(
      { toolName: "read", value: "src/main.ts", paths: ["src/main.ts"] },
      "/repo",
      cfg({ read: "allow" }),
    );
    expect(v.action).toBe("allow");
  });

  it("denies path layer even when read allows", () => {
    const c = cfg({ path: { "*.env": "deny" }, read: "allow" });
    const v = decide(
      { toolName: "read", value: "src/.env", paths: ["src/.env"] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
  });

  it("asks when external_directory triggers ask", () => {
    const c = cfg({ read: "allow", external_directory: "ask" });
    const v = decide(
      { toolName: "read", value: "../foo.txt", paths: ["../foo.txt"] },
      "/repo",
      c,
    );
    expect(v.action).toBe("ask");
  });

  it("uses last-match-wins inside a layer", () => {
    const c = cfg({ bash: { "rm *": "deny", "rm -rf *": "allow" } });
    const v = decide(
      { toolName: "bash", value: "rm -rf /tmp", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("allow");
  });

  it("splits chained bash commands and takes most restrictive", () => {
    const c = cfg({ bash: { "rm *": "deny", "echo *": "allow" } });
    const v = decide(
      { toolName: "bash", value: "echo hello && rm foo", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
  });

  it("denies external_directory with DenyWithReason object", () => {
    const c = cfg({
      read: "allow",
      external_directory: {
        action: "deny",
        reason: "not allowed outside project",
      },
    });
    const v = decide(
      { toolName: "read", value: "../foo.txt", paths: ["../foo.txt"] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
    expect(v.reason).toBe("not allowed outside project");
  });

  it("handles DenyWithReason for non-bash surface tool", () => {
    const c = cfg({ my_tool: { action: "deny", reason: "tool is unsafe" } });
    const v = decide(
      { toolName: "my_tool", value: "do_something", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
    expect(v.reason).toBe("tool is unsafe");
  });

  it("denies path with DenyWithReason object", () => {
    const c = cfg({
      path: { "*.env": { action: "deny", reason: "env files blocked" } },
    });
    const v = decide(
      { toolName: "read", value: ".env", paths: [".env"] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
    expect(v.reason).toBe("env files blocked");
  });

  it("returns defaultPolicy when no rules match", () => {
    const v = decide(
      { toolName: "unknown_tool", value: "something", paths: [] },
      "/repo",
      cfg({}, "deny"),
    );
    expect(v.action).toBe("deny");
  });

  it("returns defaultPolicy when no paths and no surface rules", () => {
    const v = decide(
      { toolName: "bash", value: "echo hello", paths: [] },
      "/repo",
      cfg({}, "ask"),
    );
    expect(v.action).toBe("ask");
  });

  it("skips path and external_directory layers when paths is empty", () => {
    const c = cfg({
      path: { "*": "deny" },
      external_directory: "ask",
      bash: { "echo *": "allow" },
    });
    const v = decide(
      { toolName: "bash", value: "echo hello", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("allow");
  });

  it("path deny overrides bash allow", () => {
    const c = cfg({ path: { ".env": "deny" }, bash: { "cat *": "allow" } });
    const v = decide(
      { toolName: "bash", value: "cat .env", paths: [".env"] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
  });

  it("handles deny with reason object", () => {
    const c = cfg({
      bash: { "npm *": { action: "deny", reason: "Use pnpm instead" } },
    });
    const v = decide(
      { toolName: "bash", value: "npm install", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("deny");
    expect(v.reason).toBe("Use pnpm instead");
  });

  it("treats mcp string rule as catch-all", () => {
    const c = cfg({ mcp: "allow" });
    const v = decide(
      { toolName: "mcp", value: "mcp_call", paths: [] },
      "/repo",
      c,
    );
    expect(v.action).toBe("allow");
  });
});
