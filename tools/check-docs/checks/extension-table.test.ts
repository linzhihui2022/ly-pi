import { describe, expect, it } from "vitest";
import { checkExtensionTable } from "./extension-table";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const README_OK = [
  "# configure",
  "",
  "| 子模块 | 功能 |",
  "|--------|------|",
  "| **my-back** | /back 命令 |",
  "| **my-hud** | 状态栏 |",
  "",
].join("\n");

describe("checkExtensionTable", () => {
  it("passes when the README table matches the ly-pi submodules", () => {
    const t = tree({
      "README.md": README_OK,
      "ly-pi/my-back/index.ts": "",
      "ly-pi/my-hud/index.ts": "",
    });

    expect(checkExtensionTable(t)).toEqual([]);
  });

  it("fails when a ly-pi submodule is missing from the README table", () => {
    const t = tree({
      "README.md": README_OK,
      "ly-pi/my-back/index.ts": "",
      "ly-pi/my-hud/index.ts": "",
      "ly-pi/my-html/index.ts": "",
    });

    expect(checkExtensionTable(t)).toEqual([
      "ly-pi/my-html exists but is not listed in the README extension table",
    ]);
  });

  it("fails when the README table lists a submodule that has no ly-pi directory", () => {
    const t = tree({
      "README.md": README_OK,
      "ly-pi/my-back/index.ts": "",
    });

    expect(checkExtensionTable(t)).toEqual([
      "README extension table lists my-hud but ly-pi/my-hud does not exist",
    ]);
  });

  it("ignores other files under ly-pi that are not submodule entry points", () => {
    const t = tree({
      "README.md": README_OK,
      "ly-pi/my-back/index.ts": "",
      "ly-pi/my-hud/index.ts": "",
      "ly-pi/src/shared.ts": "",
      "ly-pi/web-preview/server.ts": "",
    });

    expect(checkExtensionTable(t)).toEqual([]);
  });

  it("fails when README.md is missing", () => {
    const t = tree({});

    expect(checkExtensionTable(t)).toEqual(["README.md not found"]);
  });
});
