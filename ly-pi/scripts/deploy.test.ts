import { spawnSync } from "node:child_process";
import {
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
  it("does not create a legacy renderer config on first deployment", () => {
    const stagingDir = createStagingDir();
    const legacyConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
      "config.json",
    );
    const bun = spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    if (!bun) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(bun, ["run", "scripts/deploy.ts"], {
        cwd: projectDir,
        encoding: "utf8",
        env: { PATH: "", PI_STAGING_DIR: stagingDir },
      });

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(existsSync(legacyConfig)).toBe(false);
  });

  it("does not modify an existing legacy renderer config", () => {
    const stagingDir = createStagingDir();
    const legacyConfig = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
      "config.json",
    );
    mkdirSync(dirname(legacyConfig), { recursive: true });
    writeFileSync(legacyConfig, '{"enabled":true}\n');

    const bun = spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    if (!bun) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(bun, ["run", "scripts/deploy.ts"], {
        cwd: projectDir,
        encoding: "utf8",
        env: { PATH: "", PI_STAGING_DIR: stagingDir },
      });

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(readFileSync(legacyConfig, "utf8")).toBe('{"enabled":true}\n');
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

  it("removes the retired manifest without modifying locally owned model settings", () => {
    const stagingDir = createStagingDir();
    const agentDir = join(stagingDir, "agent");
    const extensionDir = join(agentDir, "extensions", "ly-pi");
    const manifestPath = join(extensionDir, "model-policies.json");
    const localModelsPath = join(extensionDir, "models.local.json");
    const settingsPath = join(agentDir, "settings.json");
    const locallyOwnedModels = {
      defaultProvider: "local",
      defaultModel: "primary",
      defaultThinkingLevel: "high",
      subagents: {
        agentOverrides: {
          scout: { model: "local/scout", thinking: "low" },
          delegate: { model: "local/delegate", thinking: "medium" },
          "image-reader": { model: "local/image", thinking: "high" },
        },
      },
    };
    mkdirSync(extensionDir, { recursive: true });
    writeFileSync(manifestPath, '{"version":"previous"}\n');
    writeFileSync(localModelsPath, "not valid JSON\n");
    writeFileSync(
      settingsPath,
      `${JSON.stringify({ customSetting: true, ...locallyOwnedModels })}\n`,
    );

    const bun = spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    if (!bun) {
      throw new Error("Bun executable is required to test deployment.");
    }

    const cleanupBundle = ensureExtensionBundle();
    try {
      const result = spawnSync(bun, ["run", "scripts/deploy.ts"], {
        cwd: projectDir,
        encoding: "utf8",
        env: { PATH: "", PI_STAGING_DIR: stagingDir },
      });

      expect(result.status, result.stderr).toBe(0);
    } finally {
      cleanupBundle();
    }

    expect(existsSync(manifestPath)).toBe(false);
    expect(readFileSync(localModelsPath, "utf8")).toBe("not valid JSON\n");
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toMatchObject(
      locallyOwnedModels,
    );
  });

  it("does not define repository-owned model settings", () => {
    const source = JSON.parse(
      readFileSync(
        join(projectDir, "assets", "config", "settings.json"),
        "utf8",
      ),
    );

    expect(source.settings).not.toHaveProperty("defaultProvider");
    expect(source.settings).not.toHaveProperty("defaultModel");
    expect(source.settings).not.toHaveProperty("defaultThinkingLevel");
    expect(source.subagents).not.toHaveProperty("agentOverrides");
  });
});
