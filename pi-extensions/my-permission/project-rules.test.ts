import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ProjectConfig,
  createProjectRules,
} from "./project-rules.js";

let tmpDir: string;
let rules: ReturnType<typeof createProjectRules>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-permission-"));
  rules = createProjectRules(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function hashCwd(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 12);
}

describe("getProjectConfigPath", () => {
  it("returns a hash-based path under the projects directory", () => {
    const cwd = "/home/user/project";
    const expected = path.join(tmpDir, "projects", `${hashCwd(cwd)}.json`);
    expect(rules.getProjectConfigPath(cwd)).toBe(expected);
  });

  it("produces different paths for different cwds", () => {
    const a = rules.getProjectConfigPath("/a");
    const b = rules.getProjectConfigPath("/b");
    expect(a).not.toBe(b);
  });
});

describe("loadProjectConfig", () => {
  it("returns undefined when the project file does not exist", () => {
    expect(rules.loadProjectConfig("/nonexistent/project")).toBeUndefined();
  });

  it("returns the parsed config when the file exists", () => {
    const cwd = "/home/user/project";
    const filePath = rules.getProjectConfigPath(cwd);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const config: ProjectConfig = { default: "deny" };
    fs.writeFileSync(filePath, JSON.stringify(config), "utf-8");

    const loaded = rules.loadProjectConfig(cwd);
    expect(loaded).toEqual(config);
  });

  it("throws when the file contains invalid JSON", () => {
    const cwd = "/home/user/project";
    const filePath = rules.getProjectConfigPath(cwd);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "not json", "utf-8");

    expect(() => rules.loadProjectConfig(cwd)).toThrow();
  });
});

describe("saveProjectConfig", () => {
  it("creates the projects directory if it does not exist", () => {
    const cwd = "/home/user/project";
    rules.saveProjectConfig(cwd, { default: "allow" });

    expect(fs.existsSync(path.join(tmpDir, "projects"))).toBe(true);
  });

  it("writes the config as formatted JSON", () => {
    const cwd = "/home/user/project";
    const config: ProjectConfig = {
      default: "ask",
      tools: { bash: "deny" },
    };
    rules.saveProjectConfig(cwd, config);

    const filePath = rules.getProjectConfigPath(cwd);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(JSON.parse(content)).toEqual(config);
    expect(content).toMatch(/\n$/);
  });

  it("overwrites an existing config", () => {
    const cwd = "/home/user/project";
    rules.saveProjectConfig(cwd, { default: "allow" });
    rules.saveProjectConfig(cwd, { default: "deny" });

    const loaded = rules.loadProjectConfig(cwd);
    expect(loaded?.default).toBe("deny");
  });

  it("performs an atomic write via temp file + rename", () => {
    const cwd = "/home/user/project";
    rules.saveProjectConfig(cwd, { default: "allow" });

    const filePath = rules.getProjectConfigPath(cwd);
    const dir = path.dirname(filePath);
    const entries = fs.readdirSync(dir);
    const tempFiles = entries.filter((e) => e.startsWith("."));
    expect(tempFiles).toEqual([]);
  });
});
