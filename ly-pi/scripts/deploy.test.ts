import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const LY_PI_DIR = fileURLToPath(new URL("..", import.meta.url));
const DIST_DIR = join(LY_PI_DIR, "dist");
const tempDirs: string[] = [];
let distSnapshotDir: string | undefined;
let hadDist = false;

function stagingDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ly-pi-deploy-"));
  tempDirs.push(dir);
  return dir;
}

function runBun(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync("bun", args, {
    cwd: LY_PI_DIR,
    encoding: "utf-8",
    env: { ...process.env, PI_SKIP_RTK: "1", ...env },
  });
}

function deploy(staging: string) {
  return runBun(["run", "scripts/deploy.ts"], {
    PI_STAGING_DIR: staging,
  });
}

describe("deploy model policy settings", () => {
  beforeAll(() => {
    hadDist = existsSync(DIST_DIR);
    if (hadDist) {
      distSnapshotDir = mkdtempSync(join(tmpdir(), "ly-pi-dist-snapshot-"));
      cpSync(DIST_DIR, join(distSnapshotDir, "dist"), { recursive: true });
    }

    const build = runBun([
      "build",
      "./index.ts",
      "--outdir",
      "dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--external",
      "@earendil-works/*",
    ]);
    expect(build.status).toBe(0);
  });

  afterAll(() => {
    rmSync(DIST_DIR, { recursive: true, force: true });
    if (distSnapshotDir) {
      cpSync(join(distSnapshotDir, "dist"), DIST_DIR, { recursive: true });
      rmSync(distSnapshotDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("copies the validated manifest into the extension directory", () => {
    const staging = stagingDir();

    const result = deploy(staging);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("rtk init: skipped");
    expect(
      readFileSync(
        join(staging, "agent", "extensions", "ly-pi", "model-policies.json"),
        "utf-8",
      ),
    ).toBe(
      readFileSync(
        join(LY_PI_DIR, "assets", "config", "model-policies.json"),
        "utf-8",
      ),
    );
  });

  it("compiles managed defaults and agent chains without replacing other settings", () => {
    const staging = stagingDir();
    const agentDir = join(staging, "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({
        customSetting: true,
        subagents: {
          agentOverrides: { reviewer: { model: "other/reviewer" } },
        },
      }),
    );

    const result = deploy(staging);

    expect(result.status).toBe(0);
    const settings = JSON.parse(
      readFileSync(join(agentDir, "settings.json"), "utf-8"),
    );
    expect(settings).toMatchObject({
      customSetting: true,
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.6-terra",
      defaultThinkingLevel: "max",
      subagents: {
        agentOverrides: {
          reviewer: { model: "other/reviewer" },
          scout: {
            model: "deepseek/deepseek-v4-flash",
            thinking: "off",
            fallbackModels: [],
          },
          delegate: {
            model: "deepseek/deepseek-v4-flash",
            thinking: "max",
            fallbackModels: [],
          },
        },
      },
    });
  });

  it("compiles legal local overrides into the affected roles", () => {
    const staging = stagingDir();
    const extensionDir = join(staging, "agent", "extensions", "ly-pi");
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(
      join(extensionDir, "models.local.json"),
      JSON.stringify({
        version: 1,
        policies: {
          "primary-default": {
            slots: { primary: { model: "local/primary", thinking: "high" } },
          },
          "fast-default": {
            slots: { primary: { model: "local/scout", thinking: "low" } },
          },
          "standard-default": {
            slots: {
              primary: { model: "local/delegate", thinking: "medium" },
            },
          },
        },
      }),
    );

    const result = deploy(staging);

    expect(result.status).toBe(0);
    const settings = JSON.parse(
      readFileSync(join(staging, "agent", "settings.json"), "utf-8"),
    );
    expect(settings).toMatchObject({
      defaultProvider: "local",
      defaultModel: "primary",
      defaultThinkingLevel: "high",
      subagents: {
        agentOverrides: {
          scout: {
            model: "local/scout",
            thinking: "low",
            fallbackModels: [],
          },
          delegate: {
            model: "local/delegate",
            thinking: "medium",
            fallbackModels: [],
          },
        },
      },
    });
  });

  it("fails deployment before writing when a security policy is overridden", () => {
    const staging = stagingDir();
    const agentDir = join(staging, "agent");
    const extensionDir = join(agentDir, "extensions", "ly-pi");
    const settingsPath = join(agentDir, "settings.json");
    const bundlePath = join(extensionDir, "index.js");
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(settingsPath, '{"sentinel":"settings"}\n');
    writeFileSync(bundlePath, "existing bundle\n");
    writeFileSync(
      join(extensionDir, "models.local.json"),
      JSON.stringify({
        version: 1,
        policies: {
          "security-judge-default": {
            slots: { primary: { model: "local/security" } },
          },
        },
      }),
    );

    const result = deploy(staging);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "cannot override security policy 'security-judge-default'",
    );
    expect(readFileSync(settingsPath, "utf-8")).toBe(
      '{"sentinel":"settings"}\n',
    );
    expect(readFileSync(bundlePath, "utf-8")).toBe("existing bundle\n");
    expect(existsSync(join(extensionDir, "model-policies.json"))).toBe(false);
    expect(existsSync(join(agentDir, "agents"))).toBe(false);
  });

  it("rolls back model-policy outputs when writing the manifest fails", () => {
    const staging = stagingDir();
    const agentDir = join(staging, "agent");
    const extensionDir = join(agentDir, "extensions", "ly-pi");
    const settingsPath = join(agentDir, "settings.json");
    const bundlePath = join(extensionDir, "index.js");
    const runtimePath = join(agentDir, "extensions", "subagent", "config.json");
    const manifestPath = join(extensionDir, "model-policies.json");
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(settingsPath, '{"sentinel":"settings"}\n');
    writeFileSync(bundlePath, "existing bundle\n");
    mkdirSync(manifestPath);

    const result = deploy(staging);

    expect(result.status).not.toBe(0);
    expect(readFileSync(settingsPath, "utf-8")).toBe(
      '{"sentinel":"settings"}\n',
    );
    expect(readFileSync(bundlePath, "utf-8")).toBe("existing bundle\n");
    expect(existsSync(runtimePath)).toBe(false);
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("deploys policy-generated specialist overrides without frontmatter model pins", () => {
    const staging = stagingDir();

    const result = deploy(staging);

    expect(result.status).toBe(0);
    const settings = JSON.parse(
      readFileSync(join(staging, "agent", "settings.json"), "utf-8"),
    );
    const manifest = JSON.parse(
      readFileSync(
        join(LY_PI_DIR, "assets", "config", "model-policies.json"),
        "utf-8",
      ),
    ) as {
      roles: Record<string, string>;
      policies: Record<
        string,
        { candidates: Array<{ model: string; thinking: string }> }
      >;
    };
    const expectedOverride = (role: string) => {
      const [primary, ...fallbacks] =
        manifest.policies[manifest.roles[role]].candidates;
      return {
        model: primary.model,
        thinking: primary.thinking,
        fallbackModels: fallbacks.map((candidate) => candidate.model),
      };
    };
    expect(settings.subagents.agentOverrides).toMatchObject({
      "image-reader": expectedOverride("vision"),
      "pr-code-reviewer": expectedOverride("standard"),
      "pr-comment-analyzer": expectedOverride("standard"),
      "pr-silent-failure-hunter": expectedOverride("standard"),
      "pr-test-analyzer": expectedOverride("standard"),
      "pr-type-design-analyzer": expectedOverride("standard"),
    });

    const requiredFrontmatter = {
      "image-reader": [
        "tools: read, grep, find",
        "acceptanceRole: read-only",
        "你是一名视觉分析专家",
      ],
      "pr-comment-analyzer": [
        "tools: read, bash, grep, find, ls",
        "acceptanceRole: read-only",
        "你是一名严谨的代码注释分析师",
      ],
    };
    for (const [agent, requiredFields] of Object.entries(requiredFrontmatter)) {
      const frontmatter = readFileSync(
        join(staging, "agent", "agents", `${agent}.md`),
        "utf-8",
      );
      expect(frontmatter).not.toMatch(/^model:/m);
      expect(frontmatter).not.toMatch(/^thinking:/m);
      for (const field of requiredFields) {
        expect(frontmatter).toContain(field);
      }
    }
    for (const agent of [
      "pr-code-reviewer",
      "pr-silent-failure-hunter",
      "pr-test-analyzer",
      "pr-type-design-analyzer",
    ]) {
      const frontmatter = readFileSync(
        join(staging, "agent", "agents", `${agent}.md`),
        "utf-8",
      );
      expect(frontmatter).not.toMatch(/^model:/m);
      expect(frontmatter).not.toMatch(/^thinking:/m);
    }
  });

  it("does not duplicate managed model choices in source settings", () => {
    const source = JSON.parse(
      readFileSync(
        join(LY_PI_DIR, "assets", "config", "settings.json"),
        "utf-8",
      ),
    );

    expect(source.settings).not.toHaveProperty("defaultProvider");
    expect(source.settings).not.toHaveProperty("defaultModel");
    expect(source.settings).not.toHaveProperty("defaultThinkingLevel");
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty("scout");
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "delegate",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "image-reader",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "pr-code-reviewer",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "pr-comment-analyzer",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "pr-silent-failure-hunter",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "pr-test-analyzer",
    );
    expect(source.subagents.agentOverrides ?? {}).not.toHaveProperty(
      "pr-type-design-analyzer",
    );
  });
});
