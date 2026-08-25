import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const stagingDirs: string[] = [];
const projectDir = join(import.meta.dirname, "..");
const distDir = join(projectDir, "dist");
const distFile = join(distDir, "index.js");
const workerDistDir = join(distDir, "my-worktree");
const workerDistFile = join(workerDistDir, "close-worker-main.js");

function createStagingDir(): string {
  const stagingDir = mkdtempSync(join(tmpdir(), "ly-pi-deploy-"));
  stagingDirs.push(stagingDir);
  return stagingDir;
}

function ensureExtensionBundle(): () => void {
  const createdDistDir = !existsSync(distDir);
  const createdWorkerDistDir = !existsSync(workerDistDir);
  const createdFiles: string[] = [];

  if (!existsSync(distFile)) {
    mkdirSync(dirname(distFile), { recursive: true });
    writeFileSync(distFile, "export {};\n");
    createdFiles.push(distFile);
  }
  if (!existsSync(workerDistFile)) {
    mkdirSync(workerDistDir, { recursive: true });
    writeFileSync(workerDistFile, "export {};\n");
    createdFiles.push(workerDistFile);
  }

  return () => {
    for (const file of createdFiles) {
      rmSync(file, { force: true });
    }
    if (createdWorkerDistDir) {
      rmdirSync(workerDistDir);
    }
    if (createdDistDir) {
      rmdirSync(distDir);
    }
  };
}

afterEach(() => {
  for (const stagingDir of stagingDirs.splice(0)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
});

describe("deploy", () => {
  it("does not deploy the new extension when the legacy renderer cannot be disabled", () => {
    const stagingDir = createStagingDir();
    const legacyConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
      "config.json",
    );
    const extensionBundle = join(
      stagingDir,
      "agent",
      "extensions",
      "ly-pi",
      "index.js",
    );
    const legacyConfigDir = dirname(legacyConfig);
    mkdirSync(legacyConfigDir, { recursive: true });
    writeFileSync(legacyConfig, '{"enabled":true}\n');
    chmodSync(legacyConfigDir, 0o500);

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      chmodSync(legacyConfigDir, 0o700);
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status).not.toBe(0);
      expect(readFileSync(legacyConfig, "utf8")).toBe('{"enabled":true}\n');
      expect(existsSync(extensionBundle)).toBe(false);
    } finally {
      chmodSync(legacyConfigDir, 0o700);
      cleanupBundle();
    }
  });

  it("rolls back the legacy cutover when the new extension cannot be staged", () => {
    const stagingDir = createStagingDir();
    const legacyConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
      "config.json",
    );
    const extensionDir = join(stagingDir, "agent", "extensions", "ly-pi");
    mkdirSync(dirname(legacyConfig), { recursive: true });
    mkdirSync(dirname(extensionDir), { recursive: true });
    writeFileSync(legacyConfig, '{"enabled":true}\n');
    writeFileSync(extensionDir, "not a directory\n");

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status).not.toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(legacyConfig, "utf8")).toBe('{"enabled":true}\n');
    expect(readFileSync(extensionDir, "utf8")).toBe("not a directory\n");
  });

  it("disables the legacy renderer while preserving its installed package", () => {
    const stagingDir = createStagingDir();
    const legacyConfigDir = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
    );
    const legacyConfig = join(legacyConfigDir, "config.json");
    const packageFile = join(
      stagingDir,
      "agent",
      "npm",
      "node_modules",
      "pi-tool-display",
      "package.json",
    );
    const toolDisplayConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "ly-pi",
      "my-tool-display.json",
    );
    mkdirSync(legacyConfigDir, { recursive: true });
    mkdirSync(dirname(packageFile), { recursive: true });
    writeFileSync(legacyConfig, '{"enabled":true}\n');
    writeFileSync(packageFile, '{"name":"pi-tool-display"}\n');

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(legacyConfig, "utf8")).toBe(
      '{\n  "enabled": false\n}\n',
    );
    expect(readFileSync(packageFile, "utf8")).toBe(
      '{"name":"pi-tool-display"}\n',
    );
    expect(readFileSync(toolDisplayConfig, "utf8")).toBe(
      '{\n  "enabled": true,\n  "bashCollapsedLines": 10,\n  "diffCollapsedLines": 24\n}\n',
    );
  });

  it("creates the disabled legacy config on the first deployment", () => {
    const stagingDir = createStagingDir();
    const legacyConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
      "config.json",
    );
    const packageFile = join(
      stagingDir,
      "agent",
      "npm",
      "node_modules",
      "pi-tool-display",
      "package.json",
    );

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(legacyConfig, "utf8")).toBe(
      '{\n  "enabled": false\n}\n',
    );
    expect(existsSync(packageFile)).toBe(false);
  });

  it("marks the deployed close-worktree worker as an ES module", () => {
    const stagingDir = createStagingDir();
    const bun = spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    if (!bun) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const build = spawnSync(bun, ["run", "build"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);

    const deploy = spawnSync(bun, ["run", "scripts/deploy.ts"], {
      cwd: projectDir,
      encoding: "utf8",
      env: { ...process.env, PATH: stagingDir, PI_STAGING_DIR: stagingDir },
    });
    expect(deploy.status).toBe(0);

    const extensionDir = join(stagingDir, "agent", "extensions", "ly-pi");
    const workerPath = join(extensionDir, "close-worktree-worker.js");
    expect(existsSync(workerPath)).toBe(true);
    expect(
      JSON.parse(readFileSync(join(extensionDir, "package.json"), "utf8")),
    ).toEqual({ type: "module" });

    const worker = spawnSync("node", [realpathSync(workerPath)], {
      encoding: "utf8",
    });
    expect(worker.status).toBe(1);
    expect(worker.stderr).not.toContain("MODULE_TYPELESS_PACKAGE_JSON");
  });

  it("copies the validated model policy manifest into the extension", () => {
    const stagingDir = createStagingDir();
    const manifestPath = join(
      stagingDir,
      "agent",
      "extensions",
      "ly-pi",
      "model-policies.json",
    );
    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(manifestPath, "utf8")).toBe(
      readFileSync(
        join(projectDir, "assets", "config", "model-policies.json"),
        "utf8",
      ),
    );
  });

  it("does not write the extension when the local model override is invalid", () => {
    const stagingDir = createStagingDir();
    const extensionDir = join(stagingDir, "agent", "extensions", "ly-pi");
    const manifestPath = join(extensionDir, "model-policies.json");
    const extensionPath = join(extensionDir, "index.js");
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(manifestPath, '{"version":"previous"}\n');
    writeFileSync(
      join(extensionDir, "models.local.json"),
      JSON.stringify({
        version: 1,
        policies: {
          "fast-default": {
            slots: { primary: { failurePolicy: "error" } },
          },
        },
      }),
    );

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("invalid local model override");
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(manifestPath, "utf8")).toBe('{"version":"previous"}\n');
    expect(existsSync(extensionPath)).toBe(false);
  });

  it("compiles primary, scout, and delegate while preserving unrelated settings", () => {
    const stagingDir = createStagingDir();
    const agentDir = join(stagingDir, "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({
        customSetting: true,
        subagents: {
          agentOverrides: {
            reviewer: { model: "other/reviewer" },
            "image-reader": { model: "other/image" },
          },
        },
      }),
    );

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    const settings = JSON.parse(
      readFileSync(join(agentDir, "settings.json"), "utf8"),
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

  it("deploys policy-generated specialist overrides without frontmatter model pins", () => {
    const stagingDir = createStagingDir();
    const agentDir = join(stagingDir, "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({
        subagents: {
          agentOverrides: {
            "image-reader": { model: "other/image" },
            "pr-comment-analyzer": { model: "other/comment" },
          },
        },
      }),
    );

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    const settings = JSON.parse(
      readFileSync(join(agentDir, "settings.json"), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(
        join(projectDir, "assets", "config", "model-policies.json"),
        "utf8",
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
      "pr-comment-analyzer": expectedOverride("standard"),
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
        join(stagingDir, "agent", "agents", `${agent}.md`),
        "utf8",
      );
      expect(frontmatter).not.toMatch(/^model:/m);
      expect(frontmatter).not.toMatch(/^thinking:/m);
      for (const field of requiredFields) {
        expect(frontmatter).toContain(field);
      }
    }
  });

  it("compiles legal local overrides into primary, scout, and delegate", () => {
    const stagingDir = createStagingDir();
    const extensionDir = join(stagingDir, "agent", "extensions", "ly-pi");
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

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    const settings = JSON.parse(
      readFileSync(join(stagingDir, "agent", "settings.json"), "utf8"),
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

  it("rejects a security local override before writing settings", () => {
    const stagingDir = createStagingDir();
    const extensionDir = join(stagingDir, "agent", "extensions", "ly-pi");
    const settingsPath = join(stagingDir, "agent", "settings.json");
    mkdirSync(extensionDir, { recursive: true });
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, '{"existing":true}\n');
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

    const bunLookup = spawnSync("which", ["bun"], { encoding: "utf8" });
    if (bunLookup.status !== 0) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(
        bunLookup.stdout.trim(),
        ["run", "scripts/deploy.ts"],
        {
          cwd: projectDir,
          encoding: "utf8",
          env: { PATH: "", PI_STAGING_DIR: stagingDir },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "cannot override security policy 'security-judge-default'",
      );
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(settingsPath, "utf8")).toBe('{"existing":true}\n');
  });

  it("does not duplicate managed model choices in source settings", () => {
    const source = JSON.parse(
      readFileSync(
        join(projectDir, "assets", "config", "settings.json"),
        "utf8",
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
      "pr-comment-analyzer",
    );
  });
});
