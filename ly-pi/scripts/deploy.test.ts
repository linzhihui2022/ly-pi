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
});
