import { describe, expect, it } from "vitest";
import { checkExtensionTable } from "./extension-table";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const README_OK = [
  "# configure",
  "",
  "| 扩展 | 功能 |",
  "|------|------|",
  "| **my-back** | /back 命令 |",
  "| **my-hud** | 状态栏 |",
  "",
].join("\n");

describe("checkExtensionTable", () => {
  it("passes when the README table matches the workspace directories", () => {
    const t = tree({
      "README.md": README_OK,
      "pi-extensions/my-back/package.json": "{}",
      "pi-extensions/my-hud/package.json": "{}",
    });

    expect(checkExtensionTable(t)).toEqual([]);
  });

  it("fails when a workspace directory is missing from the README table", () => {
    const t = tree({
      "README.md": README_OK,
      "pi-extensions/my-back/package.json": "{}",
      "pi-extensions/my-hud/package.json": "{}",
      "pi-extensions/my-html/package.json": "{}",
    });

    expect(checkExtensionTable(t)).toEqual([
      "pi-extensions/my-html exists but is not listed in the README extension table",
    ]);
  });

  it("fails when the README table lists an extension that has no workspace directory", () => {
    const t = tree({
      "README.md": README_OK,
      "pi-extensions/my-back/package.json": "{}",
    });

    expect(checkExtensionTable(t)).toEqual([
      "README extension table lists my-hud but pi-extensions/my-hud does not exist",
    ]);
  });

  it("ignores directories under pi-extensions without a package.json", () => {
    const t = tree({
      "README.md": README_OK,
      "pi-extensions/my-back/package.json": "{}",
      "pi-extensions/my-hud/package.json": "{}",
      "pi-extensions/stale-shell/coverage/lcov.info": "TN:",
    });

    expect(checkExtensionTable(t)).toEqual([]);
  });

  it("fails when README.md is missing", () => {
    const t = tree({});

    expect(checkExtensionTable(t)).toEqual(["README.md not found"]);
  });
});
