import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

function createStagingDir(): string {
  const stagingDir = mkdtempSync(join(tmpdir(), "ly-pi-deploy-"));
  stagingDirs.push(stagingDir);
  return stagingDir;
}

function ensureExtensionBundle(): () => void {
  if (existsSync(distFile)) {
    return () => {};
  }

  const createdDistDir = !existsSync(distDir);
  mkdirSync(dirname(distFile), { recursive: true });
  writeFileSync(distFile, "export {};\n");
  return () => {
    rmSync(distFile, { force: true });
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
});
