import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBashToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createBashToolDefinition: vi.fn(),
  createFindToolDefinition: vi.fn(),
  createGrepToolDefinition: vi.fn(),
  createLsToolDefinition: vi.fn(),
  createReadToolDefinition: vi.fn(),
  getAgentDir: vi.fn(),
}));

import { loadToolDisplayConfig } from "./config";
import myToolDisplay from "./index";

let agentDir: string;
const nativeBashExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeSearchExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeBashResult = {
  content: [{ type: "text", text: "native bash result" }],
  details: undefined,
};
const nativeResult = {
  content: [{ type: "text", text: "native result" }],
  details: undefined,
};
const nativeSearchResult = {
  content: [{ type: "text", text: "native search result" }],
  details: { truncation: { truncated: true } },
};
const nativeRenderResult = vi.fn(() => ({
  render: () => ["native image"],
  invalidate: () => {},
}));

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function render(component: { render(width: number): string[] }): string {
  return component
    .render(120)
    .map((line) => line.trimEnd())
    .join("\n");
}

function createNativeBashDefinition(cwd: string) {
  const execute = vi.fn().mockResolvedValue(nativeBashResult);
  nativeBashExecutions.set(cwd, execute);
  return {
    name: "bash",
    label: "bash",
    description: `Bash from ${cwd}`,
    promptSnippet: "Run bash commands",
    promptGuidelines: ["Use bash for shell commands."],
    parameters: { type: "object" },
    constrainedSampling: false,
    execute,
    renderCall: (args: { command?: string }) => ({
      render: () => [`$ ${args.command ?? "..."}`],
      invalidate: () => {},
    }),
  };
}

function createNativeReadDefinition(cwd: string) {
  const execute = vi.fn().mockResolvedValue(nativeResult);
  nativeExecutions.set(cwd, execute);
  return {
    name: "read",
    label: "read",
    description: `Read from ${cwd}`,
    promptSnippet: "Read file contents",
    promptGuidelines: ["Use read to examine files instead of cat or sed."],
    parameters: { type: "object" },
    constrainedSampling: false,
    prepareArguments: vi.fn(),
    execute,
    renderResult: nativeRenderResult,
  };
}

function createNativeSearchDefinition(name: string, cwd: string) {
  const execute = vi.fn().mockResolvedValue(nativeSearchResult);
  nativeSearchExecutions.set(`${name}:${cwd}`, execute);
  return {
    name,
    label: name,
    description: `${name} from ${cwd}`,
    promptSnippet: `${name} snippet`,
    parameters: { type: "object" },
    execute,
    renderCall: () => ({
      render: () => [`native ${name}`],
      invalidate: () => {},
    }),
  };
}

function writeConfig(contents: string): void {
  const configDir = join(agentDir, "extensions", "ly-pi");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "my-tool-display.json"), contents);
}

function setup(source = "builtin", toolNames = ["read"]) {
  const tools = toolNames.map((name) => ({
    name,
    sourceInfo: { source },
  }));
  const registered: any[] = [];
  const pi = {
    getAllTools: vi.fn(() => tools),
    registerTool: vi.fn((tool: any) => {
      registered.push(tool);
      const index = tools.findIndex(
        (candidate) => candidate.name === tool.name,
      );
      if (index >= 0) {
        tools[index] = {
          name: tool.name,
          sourceInfo: { source: "extension" },
        };
      }
    }),
  };

  myToolDisplay(pi as never);

  return { pi, registered };
}

beforeEach(() => {
  nativeBashExecutions.clear();
  nativeExecutions.clear();
  nativeSearchExecutions.clear();
  agentDir = mkdtempSync(join(tmpdir(), "my-tool-display-"));
  vi.mocked(getAgentDir).mockReturnValue(agentDir);
  vi.mocked(createBashToolDefinition).mockImplementation(
    (cwd) => createNativeBashDefinition(cwd) as never,
  );
  vi.mocked(createFindToolDefinition).mockImplementation(
    (cwd) => createNativeSearchDefinition("find", cwd) as never,
  );
  vi.mocked(createGrepToolDefinition).mockImplementation(
    (cwd) => createNativeSearchDefinition("grep", cwd) as never,
  );
  vi.mocked(createLsToolDefinition).mockImplementation(
    (cwd) => createNativeSearchDefinition("ls", cwd) as never,
  );
  vi.mocked(createReadToolDefinition).mockImplementation(
    (cwd) => createNativeReadDefinition(cwd) as never,
  );
});

afterEach(() => {
  rmSync(agentDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("my-tool-display", () => {
  it("uses the default bash collapsed-line budget and keeps the command header", () => {
    const { registered } = setup("builtin", ["bash"]);
    expect(registered).toHaveLength(1);
    const bash = registered[0]!;
    const output = Array.from(
      { length: 12 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");

    expect(loadToolDisplayConfig()).toEqual({
      enabled: true,
      bashCollapsedLines: 10,
    });
    expect(
      render(bash.renderCall({ command: "printf output" }, theme, {})),
    ).toBe("$ printf output");
    expect(
      render(
        bash.renderResult(
          { content: [{ type: "text", text: output }], details: undefined },
          { expanded: false, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toContain(
      `${output.split("\n").slice(0, 10).join("\n")}\n... (2 more lines`,
    );
  });

  it("uses a valid bashCollapsedLines setting", () => {
    writeConfig(JSON.stringify({ enabled: true, bashCollapsedLines: 2 }));

    const { registered } = setup("builtin", ["bash"]);
    const bash = registered[0]!;
    const output = "one\ntwo\nthree";

    expect(loadToolDisplayConfig()).toEqual({
      enabled: true,
      bashCollapsedLines: 2,
    });
    expect(
      render(
        bash.renderResult(
          { content: [{ type: "text", text: output }], details: undefined },
          { expanded: false, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toContain("one\ntwo\n... (1 more line");
  });

  it.each([
    { label: "missing", config: { enabled: true } },
    {
      label: "non-numeric",
      config: { enabled: true, bashCollapsedLines: "2" },
    },
    { label: "negative", config: { enabled: true, bashCollapsedLines: -1 } },
  ])("falls back to 10 for a $label bashCollapsedLines setting", ({
    config,
  }) => {
    writeConfig(JSON.stringify(config));

    expect(loadToolDisplayConfig().bashCollapsedLines).toBe(10);
  });

  it("shows expanded bash output without applying the collapsed budget", () => {
    writeConfig(JSON.stringify({ enabled: true, bashCollapsedLines: 1 }));
    const { registered } = setup("builtin", ["bash"]);
    const bash = registered[0]!;
    const output = "first\nsecond\nthird";

    expect(
      render(
        bash.renderResult(
          {
            content: [{ type: "text", text: output }],
            details: {
              truncation: {
                truncated: true,
                truncatedBy: "lines",
                outputLines: 3,
                totalLines: 10,
              },
              fullOutputPath: "/tmp/pi-bash-output",
            },
          },
          { expanded: true, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toBe(output);
  });

  it("keeps bash failure status and all available output visible", () => {
    writeConfig(JSON.stringify({ enabled: true, bashCollapsedLines: 1 }));
    const { registered } = setup("builtin", ["bash"]);
    const bash = registered[0]!;
    const output = "stderr line\nstdout line\nexit code: 1";

    const rendered = render(
      bash.renderResult(
        { content: [{ type: "text", text: output }], details: undefined },
        { expanded: false, isPartial: false },
        theme,
        { isError: true },
      ),
    );

    expect(rendered).toContain("Bash command failed.");
    expect(rendered).toContain(output);
    expect(rendered).not.toContain("more lines");
  });

  it("delegates bash execution through the native definition for the execution cwd", async () => {
    const { registered } = setup("builtin", ["bash"]);
    const bash = registered[0]!;
    expect(bash).toMatchObject({
      name: "bash",
      label: "bash",
      description: `Bash from ${process.cwd()}`,
      promptSnippet: "Run bash commands",
      promptGuidelines: ["Use bash for shell commands."],
      parameters: { type: "object" },
      constrainedSampling: false,
    });
    const context = { cwd: "/other-project" };
    const onUpdate = vi.fn();

    await expect(
      bash.execute(
        "call-1",
        { command: "printf output" },
        undefined,
        onUpdate,
        context,
      ),
    ).resolves.toBe(nativeBashResult);
    expect(nativeBashExecutions.get("/other-project")).toHaveBeenCalledWith(
      "call-1",
      { command: "printf output" },
      undefined,
      onUpdate,
      context,
    );
  });

  it("does not take over a bash tool owned by another extension", () => {
    const { pi, registered } = setup("extension", ["bash"]);

    expect(registered).toEqual([]);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("hides successful ls output until expanded", () => {
    const { registered } = setup("builtin", ["ls"]);
    expect(registered).toHaveLength(1);
    const ls = registered[0]!;
    const result = {
      content: [{ type: "text", text: "src/\nREADME.md" }],
      details: undefined,
    };

    expect(
      render(
        ls.renderResult(result, { expanded: false, isPartial: false }, theme, {
          isError: false,
        }),
      ),
    ).toBe("");
    expect(
      render(
        ls.renderResult(result, { expanded: true, isPartial: false }, theme, {
          isError: false,
        }),
      ),
    ).toBe("src/\nREADME.md");
  });

  it("hides successful grep output until expanded", () => {
    const { registered } = setup("builtin", ["grep"]);
    expect(registered).toHaveLength(1);
    const grep = registered[0]!;
    const result = {
      content: [{ type: "text", text: "src/example.ts:1: match" }],
      details: undefined,
    };

    expect(
      render(
        grep.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toBe("");
    expect(
      render(
        grep.renderResult(result, { expanded: true, isPartial: false }, theme, {
          isError: false,
        }),
      ),
    ).toBe("src/example.ts:1: match");
  });

  it("hides successful find output until expanded", () => {
    const { registered } = setup("builtin", ["find"]);
    expect(registered).toHaveLength(1);
    const find = registered[0]!;
    const result = {
      content: [{ type: "text", text: "src/example.ts\nsrc/other.ts" }],
      details: undefined,
    };

    expect(
      render(
        find.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toBe("");
    expect(
      render(
        find.renderResult(result, { expanded: true, isPartial: false }, theme, {
          isError: false,
        }),
      ),
    ).toBe("src/example.ts\nsrc/other.ts");
  });

  it.each([
    "grep",
    "find",
    "ls",
  ] as const)("retains native %s metadata", (name) => {
    const { registered } = setup("builtin", [name]);

    expect(registered[0]).toMatchObject({
      name,
      label: name,
      description: `${name} from ${process.cwd()}`,
      promptSnippet: `${name} snippet`,
      parameters: { type: "object" },
    });
  });

  it.each([
    "grep",
    "find",
    "ls",
  ] as const)("shows only native %s text when expanded", (name) => {
    const { registered } = setup("builtin", [name]);
    const output = `${name} output`;

    expect(
      render(
        registered[0]!.renderResult(
          {
            content: [{ type: "text", text: output }],
            details: { truncation: { truncated: true } },
          },
          { expanded: true, isPartial: false },
          theme,
          { isError: false },
        ),
      ),
    ).toBe(output);
  });

  it("retains grep metadata, delegates execution, and keeps failures visible", async () => {
    const { registered } = setup("builtin", ["grep"]);
    const grep = registered[0]!;

    expect(grep).toMatchObject({
      name: "grep",
      label: "grep",
      description: `grep from ${process.cwd()}`,
      promptSnippet: "grep snippet",
      parameters: { type: "object" },
    });

    const context = { cwd: "/other-project" };
    await expect(
      grep.execute(
        "call-1",
        { pattern: "match" },
        undefined,
        undefined,
        context,
      ),
    ).resolves.toBe(nativeSearchResult);
    expect(
      nativeSearchExecutions.get("grep:/other-project"),
    ).toHaveBeenCalledWith(
      "call-1",
      { pattern: "match" },
      undefined,
      undefined,
      context,
    );

    expect(
      render(
        grep.renderResult(
          {
            content: [{ type: "text", text: "permission denied" }],
            details: undefined,
          },
          { expanded: false, isPartial: false },
          theme,
          { isError: true },
        ),
      ),
    ).toBe("permission denied");
  });

  it.each([
    "grep",
    "find",
    "ls",
  ] as const)("keeps the native %s call header", (name) => {
    const { registered } = setup("builtin", [name]);
    expect(render(registered[0]!.renderCall({}, theme, {}))).toBe(
      `native ${name}`,
    );
  });

  it.each([
    "grep",
    "find",
    "ls",
  ] as const)("shows %s failure diagnostics even when collapsed", (name) => {
    const { registered } = setup("builtin", [name]);
    const tool = registered[0]!;

    expect(
      render(
        tool.renderResult(
          {
            content: [{ type: "text", text: `${name} permission denied` }],
            details: undefined,
          },
          { expanded: false, isPartial: false },
          theme,
          { isError: true },
        ),
      ),
    ).toBe(`${name} permission denied`);
  });

  it.each([
    "find",
    "ls",
  ] as const)("delegates %s execution using the active working directory", async (name) => {
    const { registered } = setup("builtin", [name]);
    const tool = registered[0]!;
    const context = { cwd: "/other-project" };

    await expect(
      tool.execute("call-1", {}, undefined, undefined, context),
    ).resolves.toBe(nativeSearchResult);
    expect(
      nativeSearchExecutions.get(`${name}:/other-project`),
    ).toHaveBeenCalledWith("call-1", {}, undefined, undefined, context);
  });

  it("does not take over search tools owned by another extension", () => {
    const { pi, registered } = setup("extension", ["grep", "find", "ls"]);

    expect(registered).toEqual([]);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("hides successful read output until expanded while retaining native metadata", () => {
    const { registered } = setup();

    expect(registered).toHaveLength(1);
    const read = registered[0]!;
    expect(read).toMatchObject({
      name: "read",
      label: "read",
      description: `Read from ${process.cwd()}`,
      promptSnippet: "Read file contents",
      promptGuidelines: ["Use read to examine files instead of cat or sed."],
      parameters: { type: "object" },
      constrainedSampling: false,
    });

    expect(
      render(
        read.renderCall(
          { path: "src/example.ts", offset: 3, limit: 2 },
          theme,
          {},
        ),
      ),
    ).toBe("read src/example.ts:3-4");

    const result = {
      content: [{ type: "text", text: "first line\nsecond line" }],
      details: undefined,
    };
    const context = { isError: false };

    const collapsed = read.renderResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      context,
    );
    expect(collapsed.render(120)).toEqual([]);
    expect(render(collapsed)).toBe("");
    expect(
      render(
        read.renderResult(
          result,
          { expanded: true, isPartial: false },
          theme,
          context,
        ),
      ),
    ).toBe("first line\nsecond line");
  });

  it("renders a legacy file_path call without losing its line range", () => {
    const { registered } = setup();
    const read = registered[0]!;

    expect(
      render(
        read.renderCall({ file_path: "src/legacy.ts", offset: 5 }, theme, {}),
      ),
    ).toBe("read src/legacy.ts:5");
  });

  it("delegates expanded image results to Pi's native renderer", () => {
    const { registered } = setup();
    const read = registered[0]!;
    const result = {
      content: [
        { type: "text", text: "Read image file [image/png]" },
        { type: "image", data: "base64", mimeType: "image/png" },
      ],
      details: undefined,
    };
    const options = { expanded: true, isPartial: false };
    const context = { isError: false, showImages: true };

    expect(render(read.renderResult(result, options, theme, context))).toBe(
      "native image",
    );
    expect(nativeRenderResult).toHaveBeenCalledWith(
      result,
      options,
      theme,
      context,
    );
  });

  it("shows failure diagnostics even when collapsed", () => {
    const { registered } = setup();
    const read = registered[0]!;
    const result = {
      content: [
        { type: "text", text: "cannot read file" },
        { type: "text", text: "permission denied" },
      ],
      details: undefined,
    };

    expect(
      render(
        read.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: true },
        ),
      ),
    ).toBe("cannot read file\npermission denied");
  });

  it("shows failure diagnostics when an error arrives as a partial result", () => {
    const { registered } = setup();
    const read = registered[0]!;
    const result = {
      content: [{ type: "text", text: "connection interrupted" }],
      details: undefined,
    };

    expect(
      render(
        read.renderResult(result, { expanded: false, isPartial: true }, theme, {
          isError: true,
        }),
      ),
    ).toBe("connection interrupted");
  });

  it("delegates execution through Pi's native read definition for the execution cwd", async () => {
    const { registered } = setup();
    const read = registered[0]!;
    const onUpdate = vi.fn();
    const context = { cwd: "/other-project" };

    await expect(
      read.execute(
        "call-1",
        { path: "src/example.ts" },
        undefined,
        onUpdate,
        context,
      ),
    ).resolves.toBe(nativeResult);
    expect(createReadToolDefinition).toHaveBeenLastCalledWith("/other-project");
    expect(nativeExecutions.get("/other-project")).toHaveBeenCalledWith(
      "call-1",
      { path: "src/example.ts" },
      undefined,
      onUpdate,
      context,
    );
  });

  it("does not take over a read renderer owned by another extension", () => {
    const { pi, registered } = setup("extension");

    expect(registered).toEqual([]);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("registers at most one renderer for the same Pi instance", () => {
    const { pi, registered } = setup();

    myToolDisplay(pi as never);

    expect(registered).toHaveLength(1);
  });

  it("safely degrades when tool discovery is unavailable", () => {
    const pi = {
      getAllTools: vi.fn(() => {
        throw new Error("no interactive tool registry");
      }),
      registerTool: vi.fn(),
    };

    expect(() => myToolDisplay(pi as never)).not.toThrow();
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("leaves the native read renderer untouched when disabled", () => {
    writeConfig(JSON.stringify({ enabled: false }));

    const { pi, registered } = setup();

    expect(registered).toEqual([]);
    expect(pi.getAllTools).not.toHaveBeenCalled();
  });

  it("falls back to enabled defaults when the config is invalid", () => {
    writeConfig(JSON.stringify({ enabled: "yes" }));

    const { registered } = setup();

    expect(registered).toHaveLength(1);
  });

  it("falls back to enabled defaults when the config is malformed", () => {
    writeConfig("{ not json");

    const { registered } = setup();

    expect(registered).toHaveLength(1);
  });
});
