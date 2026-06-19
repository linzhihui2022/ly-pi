import { describe, expect, it } from "vitest";
import { compileGlob, matchGlob } from "./matcher.js";

describe("compileGlob", () => {
  it("compiles an exact pattern", () => {
    const pattern = compileGlob("file.txt");
    expect(pattern.type).toBe("exact");
    expect(pattern.source).toBe("file.txt");
  });

  it("compiles a prefix wildcard pattern", () => {
    const pattern = compileGlob("*.txt");
    expect(pattern.type).toBe("suffix");
    expect(pattern.source).toBe("*.txt");
  });

  it("compiles a suffix wildcard pattern", () => {
    const pattern = compileGlob("file.*");
    expect(pattern.type).toBe("prefix");
    expect(pattern.source).toBe("file.*");
  });

  it("compiles a full wildcard pattern", () => {
    const pattern = compileGlob("*foo*");
    expect(pattern.type).toBe("contains");
    expect(pattern.source).toBe("*foo*");
  });

  it("compiles a globstar pattern", () => {
    const pattern = compileGlob("**/*.env");
    expect(pattern.type).toBe("globstar");
    expect(pattern.source).toBe("**/*.env");
  });

  it("treats multiple non-consecutive stars as contains", () => {
    const pattern = compileGlob("a*b*c");
    expect(pattern.type).toBe("contains");
  });

  it("compiles a single star as match-all", () => {
    const pattern = compileGlob("*");
    expect(pattern.type).toBe("all");
  });
});

describe("matchGlob exact", () => {
  it("matches identical strings", () => {
    expect(matchGlob("file.txt", "file.txt")).toBe(true);
  });

  it("does not match different strings", () => {
    expect(matchGlob("file.txt", "other.txt")).toBe(false);
  });

  it("does not match a substring", () => {
    expect(matchGlob("file.txt", "file.txt.bak")).toBe(false);
  });
});

describe("matchGlob prefix wildcard", () => {
  it("matches when the suffix matches", () => {
    expect(matchGlob("*.txt", "file.txt")).toBe(true);
    expect(matchGlob("*.txt", "a.txt")).toBe(true);
  });

  it("does not match when the suffix differs", () => {
    expect(matchGlob("*.txt", "file.md")).toBe(false);
  });

  it("does not match across path segments", () => {
    expect(matchGlob("*.env", "src/.env")).toBe(false);
  });
});

describe("matchGlob suffix wildcard", () => {
  it("matches when the prefix matches", () => {
    expect(matchGlob("file.*", "file.txt")).toBe(true);
    expect(matchGlob("file.*", "file.md")).toBe(true);
  });

  it("does not match when the prefix differs", () => {
    expect(matchGlob("file.*", "other.txt")).toBe(false);
  });

  it("does not match across path segments", () => {
    expect(matchGlob("src/*", "src/a/b.ts")).toBe(false);
  });
});

describe("matchGlob contains wildcard", () => {
  it("matches when the fixed parts appear in order", () => {
    expect(matchGlob("*foo*", "foobar")).toBe(true);
    expect(matchGlob("*foo*", "barfoo")).toBe(true);
    expect(matchGlob("*foo*", "afoob")).toBe(true);
  });

  it("does not match when the fixed part is missing", () => {
    expect(matchGlob("*foo*", "bar")).toBe(false);
  });

  it("does not match across path segments for single stars", () => {
    expect(matchGlob("*.env.*", "a.env.b")).toBe(true);
    expect(matchGlob("*.env.*", "a/.env/b")).toBe(false);
  });
});

describe("matchGlob globstar", () => {
  it("matches any depth with **", () => {
    expect(matchGlob("**/*.env", ".env")).toBe(true);
    expect(matchGlob("**/*.env", "src/.env")).toBe(true);
    expect(matchGlob("**/*.env", "a/b/c.env")).toBe(true);
  });

  it("does not match when the suffix differs", () => {
    expect(matchGlob("**/*.env", ".env.example")).toBe(false);
  });

  it("supports fixed prefix directories", () => {
    expect(matchGlob("src/**/*.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "src/a/b.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "other/a.ts")).toBe(false);
  });

  it("supports fixed suffix after globstar", () => {
    expect(matchGlob("**/test/*.ts", "src/test/a.ts")).toBe(true);
    expect(matchGlob("**/test/*.ts", "test/a.ts")).toBe(true);
    expect(matchGlob("**/test/*.ts", "src/tests/a.ts")).toBe(false);
  });
});

describe("matchGlob all", () => {
  it("matches everything including empty", () => {
    expect(matchGlob("*", "")).toBe(true);
    expect(matchGlob("*", "anything")).toBe(true);
    expect(matchGlob("*", "a/b/c")).toBe(true);
  });
});

describe("matchGlob edge cases", () => {
  it("handles empty pattern as exact match", () => {
    expect(matchGlob("", "")).toBe(true);
    expect(matchGlob("", "x")).toBe(false);
  });

  it("escapes regex special characters in fixed parts", () => {
    expect(matchGlob("file.txt", "fileXtxt")).toBe(false);
    expect(matchGlob("a.b", "a.b")).toBe(true);
  });

  it("treats backslashes as literal characters", () => {
    expect(matchGlob("a.b", "aXb")).toBe(false);
    expect(matchGlob("a*b", "a/b")).toBe(false);
  });
});
