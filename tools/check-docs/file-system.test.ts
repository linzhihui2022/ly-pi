import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFileTree, isTriageSkillInstalled } from "./file-system";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "check-docs-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function put(rel: string, content = "x"): void {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

describe("buildFileTree", () => {
  it("collects files as repo-relative posix paths", () => {
    put("README.md", "readme");
    put("docs/agents/domain.md", "domain");

    const t = buildFileTree(root);

    expect(t.get("README.md")).toBe("readme");
    expect(t.get("docs/agents/domain.md")).toBe("domain");
  });

  it("stores empty content for non-markdown files", () => {
    put("pi-extensions/my-hud/package.json", "{}");

    const t = buildFileTree(root);

    expect(t.get("pi-extensions/my-hud/package.json")).toBe("");
  });

  it("skips generated and vendored directories", () => {
    put("node_modules/pkg/REQUIREMENTS.md");
    put(".git/HEAD");
    put("pi-extensions/my-hud/dist/index.js");
    put("pi-extensions/my-hud/coverage/lcov.info");
    put(".turbo/cache/x");
    put(".worktrees/copy/README.md");
    put(".pi-subagents/run/log.txt");
    put("README.md", "kept");

    const t = buildFileTree(root);

    expect([...t.keys()]).toEqual(["README.md"]);
  });

  it("skips symlinks", () => {
    put("real.md", "real");
    symlinkSync(join(root, "real.md"), join(root, "link.md"));

    const t = buildFileTree(root);

    expect([...t.keys()]).toEqual(["real.md"]);
  });
});

describe("isTriageSkillInstalled", () => {
  it("returns true when a triage skill directory exists in any skills dir", () => {
    mkdirSync(join(root, "skills-a/triage"), { recursive: true });
    mkdirSync(join(root, "skills-b"), { recursive: true });

    expect(
      isTriageSkillInstalled([join(root, "skills-a"), join(root, "skills-b")]),
    ).toBe(true);
  });

  it("returns false when no skills dir contains triage", () => {
    mkdirSync(join(root, "skills-a/tdd"), { recursive: true });

    expect(
      isTriageSkillInstalled([join(root, "skills-a"), join(root, "missing")]),
    ).toBe(false);
  });
});
