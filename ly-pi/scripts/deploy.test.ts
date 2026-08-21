import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const LY_PI_DIR = fileURLToPath(new URL("..", import.meta.url));
const tempDirs: string[] = [];

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

describe("deploy model policy config", () => {
  beforeAll(() => {
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

  it("fails deployment before writing when the local override is invalid", () => {
    const staging = stagingDir();
    const extensionDir = join(staging, "agent", "extensions", "ly-pi");
    mkdirSync(extensionDir, { recursive: true });
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

    const result = deploy(staging);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid local model override");
  });
});
