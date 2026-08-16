import { describe, expect, it } from "vitest";
import {
  countLines,
  extractExitCode,
  extractText,
  firstLine,
  flattenCommand,
  formatCallText,
  formatGenericCallText,
  hasImage,
  shortenPath,
  truncate,
} from "./format";

describe("shortenPath", () => {
  const home = "/Users/lychee";

  it("replaces home prefix with ~", () => {
    expect(shortenPath(`${home}/Documents/a.ts`, home)).toBe(
      "~/Documents/a.ts",
    );
  });

  it("keeps non-home path unchanged", () => {
    expect(shortenPath("/etc/hosts", home)).toBe("/etc/hosts");
  });

  it("does not shorten partial prefix match", () => {
    expect(shortenPath("/Users/lychee2/file", home)).toBe(
      "/Users/lychee2/file",
    );
  });

  it("shortens home itself to ~", () => {
    expect(shortenPath(home, home)).toBe("~");
  });

  it("handles empty path", () => {
    expect(shortenPath("", home)).toBe("");
  });
});

describe("flattenCommand", () => {
  it("keeps single-line command unchanged", () => {
    expect(flattenCommand("ls -la")).toBe("ls -la");
  });

  it("joins multi-line command with ;", () => {
    expect(flattenCommand("cd foo && \\\n  npm test")).toBe(
      "cd foo && ; npm test",
    );
  });

  it("collapses blank lines", () => {
    expect(flattenCommand("echo a\n\n\necho b")).toBe("echo a ; echo b");
  });
});

describe("truncate", () => {
  it("keeps short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    const text = "x".repeat(200);
    const out = truncate(text, 100);
    expect(out).toHaveLength(100);
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps text exactly at max unchanged", () => {
    expect(truncate("abcde", 5)).toBe("abcde");
  });
});

describe("firstLine", () => {
  it("returns single line as-is", () => {
    expect(firstLine("boom")).toBe("boom");
  });

  it("returns first line of multi-line text", () => {
    expect(firstLine("boom\ndetails")).toBe("boom");
  });
});

describe("extractText", () => {
  it("returns first text content", () => {
    const result = {
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    };
    expect(extractText(result)).toBe("hello");
  });

  it("returns undefined for image-only content", () => {
    const result = {
      content: [{ type: "image", data: "abc", mimeType: "image/png" }],
    };
    expect(extractText(result)).toBeUndefined();
  });

  it("returns undefined for empty content", () => {
    expect(extractText({ content: [] })).toBeUndefined();
  });
});

describe("hasImage", () => {
  it("returns false when content is missing", () => {
    expect(hasImage({})).toBe(false);
  });

  it("returns true for image content", () => {
    expect(
      hasImage({
        content: [{ type: "image", data: "x", mimeType: "image/png" }],
      }),
    ).toBe(true);
  });
});

describe("extractExitCode", () => {
  it("parses exit code from bash output", () => {
    expect(extractExitCode("some output\nexit code: 3")).toBe(3);
  });

  it("returns null when no exit code present", () => {
    expect(extractExitCode("all good")).toBeNull();
  });

  it("parses zero exit code", () => {
    expect(extractExitCode("ok\nexit code: 0")).toBe(0);
  });
});

describe("countLines", () => {
  it("counts lines", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("counts single line", () => {
    expect(countLines("a")).toBe(1);
  });
});

describe("formatCallText", () => {
  const home = "/Users/lychee";

  it("formats read with path only", () => {
    expect(formatCallText("read", { path: `${home}/a.ts` }, home)).toBe(
      "read ~/a.ts",
    );
  });

  it("formats read with offset only", () => {
    expect(formatCallText("read", { path: "/a.ts", offset: 5 }, home)).toBe(
      "read /a.ts:5-",
    );
  });

  it("formats read with limit only", () => {
    expect(formatCallText("read", { path: "/a.ts", limit: 10 }, home)).toBe(
      "read /a.ts:1-10",
    );
  });

  it("formats read without path", () => {
    expect(formatCallText("read", {}, home)).toBe("read ...");
  });

  it("formats bash with flattened truncated command", () => {
    const long = `${"x".repeat(200)}`;
    const out = formatCallText("bash", { command: long }, home);
    expect(out.startsWith("$ ")).toBe(true);
    expect(out.length).toBe(2 + 120);
  });

  it("formats bash without command", () => {
    expect(formatCallText("bash", {}, home)).toBe("$ ...");
  });

  it("formats edit", () => {
    expect(formatCallText("edit", { path: `${home}/a.ts` }, home)).toBe(
      "edit ~/a.ts",
    );
  });

  it("formats edit without path", () => {
    expect(formatCallText("edit", {}, home)).toBe("edit ...");
  });

  it("formats write with line count", () => {
    expect(
      formatCallText("write", { path: "/a.ts", content: "x\ny" }, home),
    ).toBe("write /a.ts (2 lines)");
  });

  it("formats write without content", () => {
    expect(formatCallText("write", { path: "/a.ts" }, home)).toBe(
      "write /a.ts",
    );
  });

  it("formats write without path", () => {
    expect(formatCallText("write", {}, home)).toBe("write ...");
  });

  it("formats grep with glob", () => {
    expect(
      formatCallText(
        "grep",
        { pattern: "foo", path: "/src", glob: "*.ts" },
        home,
      ),
    ).toBe("grep /foo/ in /src (*.ts)");
  });

  it("formats grep with default path", () => {
    expect(formatCallText("grep", { pattern: "foo" }, home)).toBe(
      "grep /foo/ in .",
    );
  });

  it("formats grep without pattern", () => {
    expect(formatCallText("grep", {}, home)).toBe("grep // in .");
  });

  it("formats find", () => {
    expect(
      formatCallText("find", { pattern: "*.ts", path: `${home}/src` }, home),
    ).toBe("find *.ts in ~/src");
  });

  it("formats find with default path", () => {
    expect(formatCallText("find", { pattern: "*.ts" }, home)).toBe(
      "find *.ts in .",
    );
  });

  it("formats find without pattern", () => {
    expect(formatCallText("find", {}, home)).toBe("find  in .");
  });

  it("formats ls with default path", () => {
    expect(formatCallText("ls", {}, home)).toBe("ls .");
  });

  it("formats unknown tool as its name", () => {
    expect(formatCallText("mystery", {}, home)).toBe("mystery");
  });
});

describe("formatGenericCallText", () => {
  it("uses the first non-empty string argument as the summary", () => {
    expect(
      formatGenericCallText("chrome-devtools_click", {
        uid: "12",
        includeSnapshot: false,
      }),
    ).toBe("chrome-devtools_click 12");
  });

  it("collapses multi-line strings into a single line", () => {
    expect(
      formatGenericCallText("web_search", {
        query: "line one\nline two",
      }),
    ).toBe("web_search line one line two");
  });

  it("skips empty strings when searching for the summary argument", () => {
    expect(formatGenericCallText("mcp", { server: "", tool: "search" })).toBe(
      "mcp search",
    );
  });

  it("falls back to the arg count when no string argument exists", () => {
    expect(formatGenericCallText("todo", { count: 3, enable: true })).toBe(
      "todo (2 args)",
    );
  });

  it("falls back to the bare tool name with no arguments", () => {
    expect(formatGenericCallText("mcp", {})).toBe("mcp");
  });

  it("treats undefined args as empty", () => {
    expect(
      formatGenericCallText("mcp", undefined as unknown as Record<string, unknown>),
    ).toBe("mcp");
  });

  it("truncates very long summaries", () => {
    const long = "x".repeat(200);
    const out = formatGenericCallText("fetch", { url: long });
    expect(out.length).toBeLessThanOrEqual("fetch ".length + 80);
    expect(out.endsWith("…")).toBe(true);
  });
});
