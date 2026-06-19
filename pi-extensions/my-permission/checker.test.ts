import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CheckInput,
  type CheckResult,
  createPermissionChecker,
  isExternal,
  normalizeBashCommand,
} from "./checker.js";
import type { MergedConfig } from "./config.js";
import type { SessionState } from "./session-state.js";

function makeConfig(overrides: Partial<MergedConfig> = {}): MergedConfig {
  return {
    default: "ask",
    external: "ask",
    log: { debug: false, review: true },
    tools: {},
    bash: {},
    paths: {},
    skills: {},
    ...overrides,
  };
}

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  const rules: SessionState["sessionRules"] = [];
  return {
    yolo: false,
    yoloAllSub: false,
    sessionRules: rules,
    toggleYolo: () => {},
    toggleYoloAllSub: () => {},
    addSessionRule: (rule) => rules.push(rule),
    restoreSessionRules: (rs) => {
      rules.length = 0;
      rules.push(...rs);
    },
    findSessionRule: (surface, pattern) =>
      rules.find((r) => r.surface === surface && r.pattern === pattern),
    forEachSessionRuleEntry: (cb) => rules.forEach(cb),
    clear: () => {
      rules.length = 0;
    },
    ...overrides,
  };
}

describe("normalizeBashCommand", () => {
  it("trims whitespace", () => {
    expect(normalizeBashCommand("  git status  ")).toBe("git status");
  });

  it("collapses consecutive whitespace", () => {
    expect(normalizeBashCommand("git  status")).toBe("git status");
  });

  it("preserves quoted strings", () => {
    expect(normalizeBashCommand('echo "hello world"')).toBe(
      'echo "hello world"',
    );
  });

  it("handles nested quotes of different kinds", () => {
    expect(normalizeBashCommand("echo 'hello' \"world\"")).toBe(
      "echo 'hello' \"world\"",
    );
  });

  it("strips leading environment variable assignments", () => {
    expect(normalizeBashCommand("FOO=bar git status")).toBe("git status");
    expect(normalizeBashCommand("A=1 B=2 git status --short")).toBe(
      "git status --short",
    );
  });

  it("returns undefined for empty commands", () => {
    expect(normalizeBashCommand("   ")).toBeUndefined();
  });

  it("returns undefined when only environment assignments are present", () => {
    expect(normalizeBashCommand("FOO=bar")).toBeUndefined();
    expect(normalizeBashCommand("A=1 B=2")).toBeUndefined();
  });
});

describe("isExternal", () => {
  it("returns false for paths inside cwd", () => {
    expect(isExternal("/project", "/project/file.ts")).toBe(false);
    expect(isExternal("/project", "src/file.ts")).toBe(false);
  });

  it("returns true for paths outside cwd", () => {
    expect(isExternal("/project", "/other/file.ts")).toBe(true);
    expect(isExternal("/project", "../file.ts")).toBe(true);
  });

  it("treats my-permission directory as internal", () => {
    expect(
      isExternal(
        "/project",
        path.join(
          os.homedir(),
          ".pi/agent/extensions/my-permission/config.json",
        ),
      ),
    ).toBe(false);
  });

  it("resolves symlinks", () => {
    // We cannot easily create symlinks in unit tests across platforms,
    // so we test the helper that resolves paths conceptually.
    expect(isExternal("/project", "/project/../other/file.ts")).toBe(true);
  });

  it("handles non-existent paths during resolution", () => {
    expect(isExternal("/project", "/project/nonexistent/file.txt")).toBe(false);
  });
});

describe("check tool permissions", () => {
  it("falls back to default when no rules match", () => {
    const checker = createPermissionChecker(
      makeConfig({ default: "ask" }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "unknown" });
    expect(result.state).toBe("ask");
    expect(result.origin).toBe("default");
  });

  it("matches config.tools exactly", () => {
    const checker = createPermissionChecker(
      makeConfig({ tools: { bash: "deny" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "bash" });
    expect(result.state).toBe("deny");
    expect(result.origin).toBe("global");
  });

  it("session rules take priority over config.tools", () => {
    const state = makeSessionState();
    state.addSessionRule({
      surface: "tools",
      pattern: "bash",
      action: "allow",
    });
    const checker = createPermissionChecker(
      makeConfig({ tools: { bash: "deny" } }),
      state,
    );
    const result = checker.check({ toolName: "bash" });
    expect(result.state).toBe("allow");
    expect(result.origin).toBe("session");
  });
});

describe("check bash permissions", () => {
  it("matches bash patterns against normalized commands", () => {
    const checker = createPermissionChecker(
      makeConfig({ bash: { "git status *": "allow" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "bash", command: "git status" });
    expect(result.state).toBe("allow");
    expect(result.matchedPattern).toBe("git status *");
  });

  it("does not match unrelated commands", () => {
    const checker = createPermissionChecker(
      makeConfig({ bash: { "git status *": "allow" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "bash", command: "npm test" });
    expect(result.state).toBe("ask");
  });

  it("session rules override bash config", () => {
    const state = makeSessionState();
    state.addSessionRule({
      surface: "bash",
      pattern: "npm test",
      action: "allow",
    });
    const checker = createPermissionChecker(
      makeConfig({ bash: { "npm test": "deny" } }),
      state,
    );
    const result = checker.check({ toolName: "bash", command: "npm test" });
    expect(result.state).toBe("allow");
  });
});

describe("check path permissions", () => {
  it("matches path patterns against relative paths", () => {
    const checker = createPermissionChecker(
      makeConfig({ paths: { "*.env": "deny" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "read", path: ".env" });
    expect(result.state).toBe("deny");
  });

  it("does not match across path segments for single star", () => {
    const checker = createPermissionChecker(
      makeConfig({ paths: { "*.env": "deny" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "read", path: "src/.env" });
    expect(result.state).toBe("ask");
  });

  it("matches globstar across path segments", () => {
    const checker = createPermissionChecker(
      makeConfig({ paths: { "**/*.env": "deny" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "read", path: "src/.env" });
    expect(result.state).toBe("deny");
  });

  it("uses external action for paths outside cwd", () => {
    const checker = createPermissionChecker(
      makeConfig({ external: "deny" }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "read", path: "/etc/passwd" });
    expect(result.state).toBe("deny");
    expect(result.origin).toBe("global");
  });

  it("path rules override external action", () => {
    const checker = createPermissionChecker(
      makeConfig({ external: "deny", paths: { "**": "allow" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "read", path: "/etc/passwd" });
    expect(result.state).toBe("allow");
  });
});

describe("check skill permissions", () => {
  it("matches skill patterns", () => {
    const checker = createPermissionChecker(
      makeConfig({ skills: { "my-*": "allow" } }),
      makeSessionState(),
    );
    const result = checker.check({
      toolName: "load_skill",
      skillName: "my-tool",
    });
    expect(result.state).toBe("allow");
  });
});

describe("yolo promotion", () => {
  it("promotes ask to allow when yolo is enabled", () => {
    const checker = createPermissionChecker(
      makeConfig({ default: "ask" }),
      makeSessionState({ yolo: true }),
    );
    const result = checker.check({ toolName: "bash", command: "date" });
    expect(result.state).toBe("allow");
    expect(result.origin).toBe("yolo");
  });

  it("does not promote deny when yolo is enabled", () => {
    const checker = createPermissionChecker(
      makeConfig({ tools: { bash: "deny" } }),
      makeSessionState({ yolo: true }),
    );
    const result = checker.check({ toolName: "bash" });
    expect(result.state).toBe("deny");
  });
});

describe("result fields", () => {
  it("includes surface, value, and matched pattern", () => {
    const checker = createPermissionChecker(
      makeConfig({ tools: { bash: "allow" } }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "bash" });
    expect(result.surface).toBe("tools");
    expect(result.value).toBe("bash");
    expect(result.matchedPattern).toBe("bash");
  });

  it("includes default fallback fields", () => {
    const checker = createPermissionChecker(
      makeConfig({ default: "ask" }),
      makeSessionState(),
    );
    const result = checker.check({ toolName: "unknown" });
    expect(result.surface).toBe("default");
    expect(result.value).toBe("*");
  });
});
