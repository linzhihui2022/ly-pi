import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConfigLoader, type MergedConfig } from "./config.js";
import { createProjectRules } from "./project-rules.js";

let tmpDir: string;
let globalConfigPath: string;
let projectsDir: string;
let loader: ReturnType<typeof createConfigLoader>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-permission-"));
  globalConfigPath = path.join(tmpDir, "config.json");
  projectsDir = tmpDir;
  loader = createConfigLoader({
    globalConfigPath,
    projectRules: createProjectRules(projectsDir),
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when neither global nor project config exists", () => {
    const config = loader.loadConfig("/any/cwd");
    expect(config.default).toBe("ask");
    expect(config.external).toBe("ask");
    expect(config.log).toEqual({ debug: false, review: true });
    expect(config.tools).toEqual({});
    expect(config.bash).toEqual({});
    expect(config.paths).toEqual({});
    expect(config.skills).toEqual({});
  });

  it("loads global config when present", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({
        default: "allow",
        tools: { read: "allow" },
        bash: { "git status": "allow" },
      }),
      "utf-8",
    );

    const config = loader.loadConfig("/any/cwd");
    expect(config.default).toBe("allow");
    expect(config.tools).toEqual({ read: "allow" });
    expect(config.bash).toEqual({ "git status": "allow" });
  });

  it("merges project config over global config per pattern", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({
        default: "ask",
        bash: { "git status": "allow", "git *": "ask" },
        tools: { read: "allow" },
      }),
      "utf-8",
    );

    const cwd = "/project";
    createProjectRules(projectsDir).saveProjectConfig(cwd, {
      bash: { "git *": "deny" },
      tools: { bash: "deny" },
    });

    const config = loader.loadConfig(cwd);
    expect(config.default).toBe("ask");
    expect(config.bash).toEqual({
      "git status": "allow",
      "git *": "deny",
    });
    expect(config.tools).toEqual({ read: "allow", bash: "deny" });
  });

  it("merges log fields per field", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ log: { debug: false, review: true } }),
      "utf-8",
    );

    const cwd = "/project";
    createProjectRules(projectsDir).saveProjectConfig(cwd, {
      log: { debug: true },
    });

    const config = loader.loadConfig(cwd);
    expect(config.log).toEqual({ debug: true, review: true });
  });

  it("caches the merged config for the same cwd", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ default: "allow" }),
      "utf-8",
    );

    const cwd = "/project";
    const a = loader.loadConfig(cwd);
    fs.writeFileSync(globalConfigPath, JSON.stringify({ default: "deny" }), "utf-8");
    const b = loader.loadConfig(cwd);

    expect(a.default).toBe("allow");
    expect(b.default).toBe("allow");
    expect(a).toBe(b);
  });

  it("invalidates the cache when explicitly requested", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ default: "allow" }),
      "utf-8",
    );

    const cwd = "/project";
    const a = loader.loadConfig(cwd);
    fs.writeFileSync(globalConfigPath, JSON.stringify({ default: "deny" }), "utf-8");
    loader.invalidateCache();
    const b = loader.loadConfig(cwd);

    expect(a.default).toBe("allow");
    expect(b.default).toBe("deny");
  });

  it("returns independent caches for different cwds", () => {
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({ default: "allow" }),
      "utf-8",
    );

    const a = loader.loadConfig("/project-a");
    const b = loader.loadConfig("/project-b");

    expect(a.default).toBe("allow");
    expect(b.default).toBe("allow");
    expect(a).not.toBe(b);
  });
});

describe("mergeConfig", () => {
  it("project scalar fields override global", () => {
    const merged = loader.mergeConfig(
      { default: "ask", external: "ask" },
      { default: "deny" },
    );
    expect(merged.default).toBe("deny");
    expect(merged.external).toBe("ask");
  });

  it("project patterns override global patterns", () => {
    const merged = loader.mergeConfig(
      { bash: { a: "allow", b: "ask" } },
      { bash: { b: "deny" } },
    );
    expect(merged.bash).toEqual({ a: "allow", b: "deny" });
  });

  it("log fields are merged per-field", () => {
    const merged = loader.mergeConfig(
      { log: { debug: false, review: true } },
      { log: { debug: true } },
    );
    expect(merged.log).toEqual({ debug: true, review: true });
  });
});
