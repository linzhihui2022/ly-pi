import { describe, expect, it } from "vitest";
import { checkNoLegacyDocs } from "./no-legacy-docs";

function tree(entries: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("checkNoLegacyDocs", () => {
  it("passes when no REQUIREMENTS.md or SPEC.md exists", () => {
    const t = tree({
      "README.md": "x",
      "pi-extensions/my-hud/index.ts": "x",
    });

    expect(checkNoLegacyDocs(t)).toEqual([]);
  });

  it("reports every legacy doc anywhere in the tree", () => {
    const t = tree({
      "REQUIREMENTS.md": "x",
      "SPEC.md": "x",
      "pi-extensions/my-hud/REQUIREMENTS.md": "x",
      "pi-extensions/my-hud/SPEC.md": "x",
    });

    expect(checkNoLegacyDocs(t)).toEqual([
      "legacy doc REQUIREMENTS.md must be removed",
      "legacy doc SPEC.md must be removed",
      "legacy doc pi-extensions/my-hud/REQUIREMENTS.md must be removed",
      "legacy doc pi-extensions/my-hud/SPEC.md must be removed",
    ]);
  });
});
