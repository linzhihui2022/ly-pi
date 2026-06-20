import { describe, expect, it, beforeEach } from "vitest";
import { PermissionState } from "./state";
import type { PermissionConfig } from "./types";

describe("PermissionState", () => {
  let state: PermissionState;

  beforeEach(() => {
    state = new PermissionState();
    state.init({
      permission: {
        path: [
          { key: "/etc/*", value: "ask" },
          { key: "/etc/passwd", value: "deny" },
          { key: "*.env", value: "allow" },
        ],
        bash: [
          { key: "\\.env", value: "deny" },
          { key: "curl", value: "ask" },
        ],
        tool: [],
      },
    });
  });

  it("buildAction returns allow for allow rule", () => {
    expect(state.buildAction("config", { key: "*.env", value: "allow" })).toEqual({
      action: "allow",
    });
  });

  it("buildAction returns deny for deny rule", () => {
    expect(state.buildAction("config", { key: "/etc/passwd", value: "deny" })).toEqual({
      action: "deny",
      rule: "/etc/passwd",
      from: "config",
    });
  });

  it("buildAction returns ask when no rule", () => {
    expect(state.buildAction("config")).toEqual({
      action: "ask",
      rule: "default",
      from: "config",
    });
  });

  it("buildAction returns ask when rule value is ask", () => {
    expect(state.buildAction("config", { key: "/etc/*", value: "ask" })).toEqual({
      action: "ask",
      rule: "/etc/*",
      from: "config",
    });
  });

  it("matchPathRules uses glob and last match wins", () => {
    expect(state.matchPathRules("/etc/hosts")).toEqual({ key: "/etc/*", value: "ask" });
    expect(state.matchPathRules("/etc/passwd")).toEqual({
      key: "/etc/passwd",
      value: "deny",
    });
    expect(state.matchPathRules("/etc")).toBeUndefined();
    expect(state.matchPathRules("app.env")).toEqual({ key: "*.env", value: "allow" });
    expect(state.matchPathRules("/nested/dir/config.env")).toBeUndefined();
  });

  it("matchPathRules accepts explicit rules", () => {
    expect(
      state.matchPathRules("/tmp/file", [{ key: "/tmp/*", value: "allow" }]),
    ).toEqual({ key: "/tmp/*", value: "allow" });
  });

  it("matchPathRules returns undefined when no config is loaded", () => {
    const emptyState = new PermissionState();
    expect(emptyState.matchPathRules("/anything")).toBeUndefined();
  });

  it("matchPathRules supports ** for any depth", () => {
    state.config!.permission.path.push({ key: "**/*.env", value: "deny" });
    expect(state.matchPathRules("/nested/dir/config.env")).toEqual({
      key: "**/*.env",
      value: "deny",
    });
  });

  it("matchBashRules uses regex and last match wins", () => {
    expect(state.matchBashRules("cat .env")).toEqual({ key: "\\.env", value: "deny" });
    expect(state.matchBashRules("grep secret .env")).toEqual({
      key: "\\.env",
      value: "deny",
    });
    expect(state.matchBashRules("curl https://example.com")).toEqual({
      key: "curl",
      value: "ask",
    });
    expect(state.matchBashRules("ls -la")).toBeUndefined();
  });

  it("matchBashRules accepts explicit rules", () => {
    expect(
      state.matchBashRules("echo hello", [{ key: "echo", value: "allow" }]),
    ).toEqual({ key: "echo", value: "allow" });
  });

  it("matchBashRules returns undefined when no config is loaded", () => {
    const emptyState = new PermissionState();
    expect(emptyState.matchBashRules("anything")).toBeUndefined();
  });

  it("matchBashRules returns undefined for invalid regex", () => {
    state.config!.permission.bash.push({ key: "[invalid", value: "deny" });
    expect(state.matchBashRules("anything")).toBeUndefined();
  });

  it("matchBashRules skips rules with malformed regex", () => {
    state.config!.permission.bash.push({ key: "[", value: "deny" });
    expect(state.matchBashRules("anything")).toBeUndefined();
  });
});
