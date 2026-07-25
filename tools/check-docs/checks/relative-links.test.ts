import { describe, expect, it } from "vitest";
import { checkRelativeLinks } from "./relative-links";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("checkRelativeLinks", () => {
  it("passes when every relative link resolves to a file in the tree", () => {
    const t = tree({
      "README.md": "见 [需求](./REQUIREMENTS.md) 与 [指南](AGENTS.md#测试)",
      "AGENTS.md": "见 [配置](docs/agents/issue-tracker.md)",
      "REQUIREMENTS.md": "x",
      "docs/agents/issue-tracker.md": "x",
    });

    expect(checkRelativeLinks(t)).toEqual([]);
  });

  it("reports each broken relative link with its source file", () => {
    const t = tree({
      "README.md": "见 [需求](./REQUIREMENTS.md)",
      "AGENTS.md": "见 [规格](SPEC.md)",
    });

    expect(checkRelativeLinks(t)).toEqual([
      "README.md links to ./REQUIREMENTS.md which does not exist",
      "AGENTS.md links to SPEC.md which does not exist",
    ]);
  });

  it("ignores external urls, pure anchors and empty targets", () => {
    const t = tree({
      "README.md":
        "[pi](https://pi.dev) [mail](mailto:a@b.c) [top](#configure) [empty]( )",
    });

    expect(checkRelativeLinks(t)).toEqual([]);
  });

  it("skips source files that do not exist", () => {
    const t = tree({});

    expect(checkRelativeLinks(t)).toEqual([]);
  });
});
