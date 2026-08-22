import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  generateDiffString,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createBashToolDefinition: vi.fn(),
  createEditToolDefinition: vi.fn(),
  createFindToolDefinition: vi.fn(),
  createGrepToolDefinition: vi.fn(),
  createLsToolDefinition: vi.fn(),
  createReadToolDefinition: vi.fn(),
  createWriteToolDefinition: vi.fn(),
  generateDiffString: vi.fn(),
  getAgentDir: vi.fn(),
}));

import { loadToolDisplayConfig } from "./config";
import myToolDisplay from "./index";

let agentDir: string;
let workspaceDirs: string[];
let nextNativeWriteResult: unknown;
const nativeBashExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeEditExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeWriteExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeWriteQueues = new Map<string, Promise<void>>();
const nativeExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeSearchExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeBashResult = {
  content: [{ type: "text", text: "native bash result" }],
  details: undefined,
};
const nativeWriteResult = {
  content: [{ type: "text", text: "Successfully wrote 12 bytes to file.ts" }],
  details: undefined,
};
const nativeEditResult = {
  content: [
    { type: "text", text: "Successfully replaced 1 block(s) in file.ts." },
  ],
  details: {
    diff: "  1|const value = 1;\n- 2|const oldValue = true;\n+ 2|const newValue = false;",
    patch: "@@ -1,2 +1,2 @@",
    firstChangedLine: 2,
  },
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

function render(
  component: { render(width: number): string[] },
  width = 120,
): string {
  return component
    .render(width)
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

function createNativeEditDefinition(cwd: string) {
  const execute = vi.fn().mockResolvedValue(nativeEditResult);
  nativeEditExecutions.set(cwd, execute);
  return {
    name: "edit",
    label: "edit",
    description: `Edit from ${cwd}`,
    promptSnippet: "Make precise edits",
    promptGuidelines: ["Use edit for precise changes."],
    parameters: { type: "object" },
    constrainedSampling: false,
    renderShell: "self" as const,
    prepareArguments: vi.fn(),
    execute,
    renderCall: () => ({
      render: () => ["native edit preview"],
      invalidate: () => {},
    }),
  };
}

function createNativeWriteDefinition(
  cwd: string,
  options?: {
    operations?: {
      mkdir(path: string): Promise<void>;
      writeFile(path: string, content: string): Promise<void>;
    };
  },
) {
  const execute = vi.fn(
    async (
      _toolCallId,
      params: {
        path: string;
        content: string;
      },
    ) => {
      if (!options?.operations) {
        return nextNativeWriteResult;
      }

      const path = resolve(cwd, params.path);
      const current = nativeWriteQueues.get(path) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((resolveQueue) => {
        release = resolveQueue;
      });
      const queued = current.then(() => next);
      nativeWriteQueues.set(path, queued);

      await current;
      try {
        await options.operations.mkdir(dirname(path));
        await options.operations.writeFile(path, params.content);
        return nextNativeWriteResult;
      } finally {
        release();
        if (nativeWriteQueues.get(path) === queued) {
          nativeWriteQueues.delete(path);
        }
      }
    },
  );
  nativeWriteExecutions.set(cwd, execute);
  return {
    name: "write",
    label: "write",
    description: `Write from ${cwd}`,
    promptSnippet: "Create or overwrite files",
    promptGuidelines: ["Use write for complete files."],
    parameters: { type: "object" },
    constrainedSampling: false,
    renderShell: "self" as const,
    prepareArguments: vi.fn(),
    execute,
    renderCall: () => ({
      render: () => ["native write preview"],
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

function createWorkspace(): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), "my-tool-display-write-"));
  workspaceDirs.push(workspaceDir);
  return workspaceDir;
}

function setup(source = "builtin", toolNames = ["read"]) {
  const tools = toolNames.map((name) => ({
    name,
    sourceInfo: { source },
  }));
  const registered: any[] = [];
  const sessionStartHandlers: Array<() => unknown> = [];
  const pi = {
    getAllTools: vi.fn(() => tools),
    on: vi.fn((event: string, handler: () => unknown) => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
    }),
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
  for (const handler of sessionStartHandlers) {
    handler();
  }

  return { pi, registered };
}

beforeEach(() => {
  nativeBashExecutions.clear();
  nativeEditExecutions.clear();
  nativeWriteExecutions.clear();
  nativeWriteQueues.clear();
  nativeExecutions.clear();
  nativeSearchExecutions.clear();
  agentDir = mkdtempSync(join(tmpdir(), "my-tool-display-"));
  workspaceDirs = [];
  nextNativeWriteResult = nativeWriteResult;
  vi.mocked(getAgentDir).mockReturnValue(agentDir);
  vi.mocked(createBashToolDefinition).mockImplementation(
    (cwd) => createNativeBashDefinition(cwd) as never,
  );
  vi.mocked(createEditToolDefinition).mockImplementation(
    (cwd) => createNativeEditDefinition(cwd) as never,
  );
  vi.mocked(createWriteToolDefinition).mockImplementation(
    (cwd, options) => createNativeWriteDefinition(cwd, options) as never,
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
  for (const workspaceDir of workspaceDirs) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe("my-tool-display", () => {
  it("renders a completed write overwrite diff after native execution", async () => {
    const workspaceDir = createWorkspace();
    writeFileSync(join(workspaceDir, "file.ts"), "const oldValue = true;\n");
    vi.mocked(generateDiffString).mockReturnValueOnce({
      diff: "- 1|const oldValue = true;\n+ 1|const newValue = false;",
      firstChangedLine: 1,
    });

    nextNativeWriteResult = {
      content: nativeWriteResult.content,
      details: { native: "metadata" },
    };
    const { registered } = setup("builtin", ["write"]);
    expect(registered).toHaveLength(1);
    const write = registered[0]!;
    const onUpdate = vi.fn();

    expect(write).toMatchObject({
      name: "write",
      label: "write",
      description: `Write from ${process.cwd()}`,
      promptSnippet: "Create or overwrite files",
      promptGuidelines: ["Use write for complete files."],
      parameters: { type: "object" },
      constrainedSampling: false,
    });
    expect(write.renderShell).toBe("default");
    expect(
      render(
        write.renderCall({ path: "file.ts", content: "new" }, theme, {
          argsComplete: true,
          isPartial: true,
          state: {},
        }),
      ),
    ).toBe("write file.ts");

    const result = await write.execute(
      "call-1",
      { path: "file.ts", content: "const newValue = false;\n" },
      undefined,
      onUpdate,
      { cwd: workspaceDir },
    );

    expect(nativeWriteExecutions.get(workspaceDir)).toHaveBeenCalledWith(
      "call-1",
      { path: "file.ts", content: "const newValue = false;\n" },
      undefined,
      onUpdate,
      { cwd: workspaceDir },
    );
    expect(result).toMatchObject({
      details: {
        native: "metadata",
        writeDiff: { diff: expect.any(String) },
      },
    });
    expect(generateDiffString).toHaveBeenCalledWith(
      "const oldValue = true;\n",
      "const newValue = false;\n",
    );
    expect(
      render(
        write.renderResult(
          result,
          { expanded: true, isPartial: false },
          theme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toContain("+ 1|const newValue = false;");
    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: true },
          theme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toBe("Writing...");
  });

  it("captures each concurrent write baseline inside the native mutation queue", async () => {
    const workspaceDir = createWorkspace();
    writeFileSync(join(workspaceDir, "file.txt"), "original\n");
    vi.mocked(generateDiffString).mockReturnValue({
      diff: "diff",
      firstChangedLine: 1,
    });

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;

    await Promise.all([
      write.execute(
        "call-first",
        { path: "file.txt", content: "first\n" },
        undefined,
        undefined,
        { cwd: workspaceDir },
      ),
      write.execute(
        "call-second",
        { path: "file.txt", content: "second\n" },
        undefined,
        undefined,
        { cwd: workspaceDir },
      ),
    ]);

    expect(generateDiffString).toHaveBeenNthCalledWith(
      1,
      "original\n",
      "first\n",
    );
    expect(generateDiffString).toHaveBeenNthCalledWith(
      2,
      "first\n",
      "second\n",
    );
  });

  it("renders a completed write diff for a new file", async () => {
    const workspaceDir = createWorkspace();
    vi.mocked(generateDiffString).mockReturnValueOnce({
      diff: "+ 1|new file",
      firstChangedLine: 1,
    });

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-new",
      { path: "new.txt", content: "new file\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(generateDiffString).toHaveBeenCalledWith("", "new file\n");
    expect(
      render(
        write.renderResult(
          result,
          { expanded: true, isPartial: false },
          theme,
          { isError: false, args: { path: "new.txt" }, state: {} },
        ),
      ),
    ).toBe("+ 1|new file");
  });

  it("renders an explicit summary for an empty write", async () => {
    const workspaceDir = createWorkspace();
    vi.mocked(generateDiffString).mockReturnValueOnce({
      diff: "",
      firstChangedLine: undefined,
    });

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-empty",
      { path: "empty.txt", content: "" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "empty.txt" }, state: {} },
        ),
      ),
    ).toContain("no text changes to display");
  });

  it("collapses completed write diffs using diffCollapsedLines", async () => {
    writeConfig(JSON.stringify({ enabled: true, diffCollapsedLines: 1 }));
    const workspaceDir = createWorkspace();
    vi.mocked(generateDiffString).mockReturnValueOnce({
      diff: "  1|context\n- 2|old\n+ 2|new",
      firstChangedLine: 2,
    });

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-collapse",
      { path: "file.ts", content: "new\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toContain("... (2 more lines, expand to view)");
  });

  it.each([
    "binary",
    "oversized",
    "outside the current workspace",
  ])("shows a safe summary for a %s write diff", async (kind) => {
    const workspaceDir = createWorkspace();
    let path = "file.bin";
    if (kind === "binary") {
      writeFileSync(join(workspaceDir, path), Buffer.from([0, 1, 2]));
    } else if (kind === "oversized") {
      writeFileSync(join(workspaceDir, path), Buffer.alloc(1_000_001, "a"));
    } else {
      const outsideDir = createWorkspace();
      path = join(outsideDir, "outside.txt");
    }

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      `call-${kind}`,
      { path, content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    const rendered = render(
      write.renderResult(result, { expanded: false, isPartial: false }, theme, {
        isError: false,
        args: { path },
        state: {},
      }),
    );
    expect(rendered).toContain("Write diff unavailable");
    expect(generateDiffString).not.toHaveBeenCalled();
  });

  it("shows a safe summary for invalid UTF-8 existing content", async () => {
    const workspaceDir = createWorkspace();
    writeFileSync(join(workspaceDir, "invalid.txt"), Buffer.from([0xff, 0xfe]));
    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-invalid-utf8",
      { path: "invalid.txt", content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "invalid.txt" }, state: {} },
        ),
      ),
    ).toContain("could not be read safely");
    expect(generateDiffString).not.toHaveBeenCalled();
  });

  it("does not read through a symlink outside the workspace", async () => {
    const workspaceDir = createWorkspace();
    const outsideDir = createWorkspace();
    writeFileSync(join(outsideDir, "outside.txt"), "outside\n");
    symlinkSync(
      join(outsideDir, "outside.txt"),
      join(workspaceDir, "link.txt"),
    );

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-symlink",
      { path: "link.txt", content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "link.txt" }, state: {} },
        ),
      ),
    ).toContain("resolves outside the current workspace");
    expect(generateDiffString).not.toHaveBeenCalled();
  });

  it("does not read through an in-workspace symlink", async () => {
    const workspaceDir = createWorkspace();
    writeFileSync(join(workspaceDir, "target.txt"), "inside\n");
    symlinkSync(
      join(workspaceDir, "target.txt"),
      join(workspaceDir, "link.txt"),
    );

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-in-workspace-symlink",
      { path: "link.txt", content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "link.txt" }, state: {} },
        ),
      ),
    ).toContain("target path is a symbolic link");
    expect(generateDiffString).not.toHaveBeenCalled();
  });

  it("shows a safe summary for binary new content", async () => {
    const workspaceDir = createWorkspace();
    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-binary-content",
      { path: "file.txt", content: "binary\0content" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "file.txt" }, state: {} },
        ),
      ),
    ).toContain("appears to be binary");
    expect(generateDiffString).not.toHaveBeenCalled();
  });

  it("shows a safe summary when the generated diff exceeds the budget", async () => {
    const workspaceDir = createWorkspace();
    vi.mocked(generateDiffString).mockReturnValueOnce({
      diff: "x".repeat(1_000_001),
      firstChangedLine: 1,
    });

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-large-diff",
      { path: "file.txt", content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "file.txt" }, state: {} },
        ),
      ),
    ).toContain("generated diff exceeds");
  });

  it("shows a safe summary when diff generation has no result", async () => {
    const workspaceDir = createWorkspace();
    writeConfig(JSON.stringify({ enabled: true }));
    vi.mocked(generateDiffString).mockReturnValueOnce(undefined as never);

    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;
    const result = await write.execute(
      "call-missing-diff",
      { path: "file.txt", content: "safe text\n" },
      undefined,
      undefined,
      { cwd: workspaceDir },
    );

    expect(
      render(
        write.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "file.txt" }, state: {} },
        ),
      ),
    ).toContain("could not be computed safely");
  });

  it("keeps write failures diagnostic and does not render a success diff", () => {
    const { registered } = setup("builtin", ["write"]);
    const write = registered[0]!;

    const rendered = render(
      write.renderResult(
        { content: [{ type: "text", text: "permission denied" }] },
        { expanded: false, isPartial: false },
        theme,
        { isError: true, args: { path: "file.txt" }, state: {} },
      ),
    );

    expect(rendered).toBe("permission denied");
    expect(rendered).not.toContain("Write completed");
  });

  it("does not take over a write tool owned by another extension", () => {
    const { pi, registered } = setup("extension", ["write"]);

    expect(registered).toEqual([]);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

  it("renders a completed edit with the native diff colors and no pending preview", () => {
    const { registered } = setup("builtin", ["edit"]);
    expect(registered).toHaveLength(1);
    const edit = registered[0]!;
    const colors: string[] = [];
    const diffTheme = {
      ...theme,
      fg: (color: string, text: string) => {
        colors.push(color);
        return text;
      },
    };

    expect(edit.renderShell).toBe("default");
    expect(
      render(
        edit.renderCall({ path: "file.ts", edits: [] }, diffTheme, {
          argsComplete: true,
          isPartial: true,
          state: {},
        }),
      ),
    ).toBe("edit file.ts");
    expect(
      render(
        edit.renderResult(
          nativeEditResult,
          { expanded: false, isPartial: false },
          diffTheme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toContain("const oldValue = true;");
    expect(colors).toEqual(
      expect.arrayContaining([
        "toolDiffContext",
        "toolDiffRemoved",
        "toolDiffAdded",
      ]),
    );
    expect(
      render(
        edit.renderCall({ path: "file.ts", edits: [] }, diffTheme, {
          argsComplete: true,
          isPartial: true,
          state: {},
        }),
      ),
    ).not.toContain("native edit preview");
    expect(
      render(
        edit.renderResult(
          nativeEditResult,
          { expanded: false, isPartial: true },
          diffTheme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toBe("Editing...");
  });

  it("collapses long edit diffs and expands to the complete returned diff", () => {
    writeConfig(JSON.stringify({ enabled: true, diffCollapsedLines: 2 }));
    const { registered } = setup("builtin", ["edit"]);
    const edit = registered[0]!;
    const diff = "  1|one\n- 2|old\n+ 2|new\n  3|three";
    const result = { content: [], details: { diff } };

    expect(
      render(
        edit.renderResult(
          result,
          { expanded: false, isPartial: false },
          theme,
          { isError: false, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toContain("... (2 more lines, expand to view)");
    expect(
      render(
        edit.renderResult(result, { expanded: true, isPartial: false }, theme, {
          isError: false,
          args: { path: "file.ts" },
          state: {},
        }),
      ),
    ).toBe(diff);
  });

  it.each([
    { label: "missing", config: { enabled: true } },
    {
      label: "non-numeric",
      config: { enabled: true, diffCollapsedLines: "2" },
    },
    { label: "negative", config: { enabled: true, diffCollapsedLines: -1 } },
  ])("falls back to 24 for a $label diffCollapsedLines setting", ({
    config,
  }) => {
    writeConfig(JSON.stringify(config));

    expect(loadToolDisplayConfig()).toEqual({
      enabled: true,
      bashCollapsedLines: 10,
      diffCollapsedLines: 24,
    });
  });

  it("keeps edit failures diagnostic and does not render a success diff", () => {
    const { registered } = setup("builtin", ["edit"]);
    const edit = registered[0]!;
    const output = "Could not edit file: file.ts. Permission denied.";
    const colors: string[] = [];
    const failureTheme = {
      ...theme,
      fg: (color: string, text: string) => {
        colors.push(color);
        return text;
      },
    };

    expect(
      render(
        edit.renderResult(
          {
            content: [{ type: "text", text: output }],
            details: nativeEditResult.details,
          },
          { expanded: false, isPartial: false },
          failureTheme,
          { isError: true, args: { path: "file.ts" }, state: {} },
        ),
      ),
    ).toBe(output);
    expect(colors).toContain("error");
    expect(colors).not.toContain("toolDiffAdded");
    expect(colors).not.toContain("toolDiffRemoved");
  });

  it("delegates edit execution and preserves native metadata for the execution cwd", async () => {
    const { registered } = setup("builtin", ["edit"]);
    const edit = registered[0]!;
    const context = { cwd: "/other-project" };
    const onUpdate = vi.fn();

    expect(edit).toMatchObject({
      name: "edit",
      label: "edit",
      description: `Edit from ${process.cwd()}`,
      promptSnippet: "Make precise edits",
      promptGuidelines: ["Use edit for precise changes."],
      parameters: { type: "object" },
      constrainedSampling: false,
    });
    await expect(
      edit.execute(
        "call-1",
        { path: "file.ts", edits: [] },
        undefined,
        onUpdate,
        context,
      ),
    ).resolves.toBe(nativeEditResult);
    expect(nativeEditExecutions.get("/other-project")).toHaveBeenCalledWith(
      "call-1",
      { path: "file.ts", edits: [] },
      undefined,
      onUpdate,
      context,
    );
  });

  it("keeps the edit diff within a narrow render width", () => {
    const { registered } = setup("builtin", ["edit"]);
    const edit = registered[0]!;
    const diff = `+ 1|${"x".repeat(80)}`;

    const lines = edit
      .renderResult(
        { content: [], details: { diff } },
        { expanded: true, isPartial: false },
        theme,
        { isError: false, args: { path: "file.ts" }, state: {} },
      )
      .render(20);

    expect(lines).not.toEqual([]);
    expect(lines.every((line: string) => line.length <= 20)).toBe(true);
  });

  it("does not take over an edit tool owned by another extension", () => {
    const { pi, registered } = setup("extension", ["edit"]);

    expect(registered).toEqual([]);
    expect(pi.registerTool).not.toHaveBeenCalled();
  });

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
      diffCollapsedLines: 24,
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
      diffCollapsedLines: 24,
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

  it("defers tool discovery until the runtime session starts", () => {
    const tools = [{ name: "read", sourceInfo: { source: "builtin" } }];
    const registered: unknown[] = [];
    const sessionStartHandlers: Array<() => unknown> = [];
    let runtimeBound = false;
    const pi = {
      getAllTools: vi.fn(() => {
        if (!runtimeBound) {
          throw new Error(
            "tool registry is not bound during extension loading",
          );
        }
        return tools;
      }),
      on: vi.fn((event: string, handler: () => unknown) => {
        if (event === "session_start") {
          sessionStartHandlers.push(handler);
        }
      }),
      registerTool: vi.fn((tool: unknown) => {
        registered.push(tool);
      }),
    };

    myToolDisplay(pi as never);

    expect(pi.getAllTools).not.toHaveBeenCalled();
    expect(pi.registerTool).not.toHaveBeenCalled();
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));

    runtimeBound = true;
    for (const handler of sessionStartHandlers) {
      handler();
    }

    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(registered).toHaveLength(1);
  });

  it("safely degrades when tool discovery is unavailable", () => {
    const sessionStartHandlers: Array<() => unknown> = [];
    const pi = {
      getAllTools: vi.fn(() => {
        throw new Error("no interactive tool registry");
      }),
      on: vi.fn((event: string, handler: () => unknown) => {
        if (event === "session_start") {
          sessionStartHandlers.push(handler);
        }
      }),
      registerTool: vi.fn(),
    };

    expect(() => {
      myToolDisplay(pi as never);
      for (const handler of sessionStartHandlers) {
        handler();
      }
    }).not.toThrow();
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
