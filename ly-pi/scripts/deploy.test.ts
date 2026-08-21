import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const bun = spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();

describe("deploy", () => {
  it("marks the deployed close-worktree worker as an ES module", () => {
    const staging = mkdtempSync(join(tmpdir(), "ly-pi-deploy-"));
    const build = spawnSync(bun, ["run", "build"], {
      cwd: packageDir,
      encoding: "utf8",
    });

    try {
      expect(build.status).toBe(0);

      const deploy = spawnSync(bun, ["run", "scripts/deploy.ts"], {
        cwd: packageDir,
        encoding: "utf8",
        env: { ...process.env, PATH: staging, PI_STAGING_DIR: staging },
      });
      expect(deploy.status).toBe(0);

      const extensionDir = join(staging, "agent", "extensions", "ly-pi");
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
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  });
});
