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
  it("removes the legacy renderer config from an existing deployment", () => {
    const stagingDir = createStagingDir();
    const legacyDir = join(
      stagingDir,
      "agent",
      "extensions",
      "pi-tool-display",
    );
    const legacyConfig = join(legacyDir, "config.json");
    const packageFile = join(legacyDir, "package.json");
    mkdirSync(legacyDir, { recursive: true });
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

    expect(existsSync(legacyConfig)).toBe(false);
    expect(readFileSync(packageFile, "utf8")).toBe(
      '{"name":"pi-tool-display"}\n',
    );
  });
});
