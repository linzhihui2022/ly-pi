import { describe, expect, it, vi } from "vitest";

const { logWarn, logError } = vi.hoisted(() => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../my-log/index", () => ({
  createDevLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: logWarn,
    error: logError,
  }),
}));

vi.mock("@earendil-works/pi-tui", () => ({
  Text: class {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  },
}));

const emptyResult = async () => ({ content: [] });

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createWriteToolDefinition: () => ({
    name: "write",
    execute: emptyResult,
    renderResult: () => ({ text: "write" }),
  }),
  createEditToolDefinition: () => ({
    name: "edit",
    execute: emptyResult,
    renderResult: () => ({ text: "edit" }),
  }),
  // bash/grep/find/ls come back without renderCall on purpose.
  createBashToolDefinition: () => ({ name: "bash", execute: emptyResult }),
  createGrepToolDefinition: () => ({ name: "grep", execute: emptyResult }),
  createFindToolDefinition: () => ({ name: "find", execute: emptyResult }),
  createLsToolDefinition: () => ({ name: "ls", execute: emptyResult }),
  createReadToolDefinition: () => ({ name: "read", execute: emptyResult }),
  generateDiffString: () => ({ diff: "" }),
  getAgentDir: () => "/tmp/agent",
  SettingsManager: {
    create: () => ({
      getShellCommandPrefix: () => "",
      getShellPath: () => "/bin/sh",
      getImageAutoResize: () => true,
    }),
  },
}));

import { DEFAULT_TOOL_DISPLAY_CONFIG } from "./config";
import { registerToolRenderers } from "./tools";

const config = DEFAULT_TOOL_DISPLAY_CONFIG;

type RegisteredTool = Record<string, unknown> & {
  name: string;
  execute?: (...args: unknown[]) => unknown;
  renderCall?: (...args: unknown[]) => unknown;
  renderResult?: (...args: unknown[]) => unknown;
};

function fakePi(tools: Array<{ name: string; source?: string }>) {
  const registered: RegisteredTool[] = [];
  const pi = {
    getAllTools: () =>
      tools.map(({ name, source = "builtin" }) => ({
        name,
        sourceInfo: { source },
      })),
    registerTool: (tool: RegisteredTool) => {
      registered.push(tool);
    },
  };
  return { pi: pi as never, registered };
}

const ctx = { cwd: "/tmp/workspace", isProjectTrusted: () => true };
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

describe("registerToolRenderers", () => {
  it("registers every builtin tool the runtime provides", () => {
    const { pi, registered } = fakePi([
      { name: "write" },
      { name: "edit" },
      { name: "bash" },
      { name: "read" },
      { name: "grep" },
      { name: "find" },
      { name: "ls" },
    ]);

    registerToolRenderers(pi, config);

    expect(registered.map((tool) => tool.name)).toEqual([
      "write",
      "edit",
      "bash",
      "read",
      "grep",
      "find",
      "ls",
    ]);
  });

  it("registers nothing when discovery fails", () => {
    const pi = {
      getAllTools: () => {
        throw new Error("boom");
      },
      registerTool: vi.fn(),
    } as never;

    registerToolRenderers(pi, config);

    expect(logWarn).toHaveBeenCalled();
  });

  it("skips tools that are not builtin", () => {
    const { pi, registered } = fakePi([
      { name: "custom", source: "user" },
      { name: "write" },
    ]);

    registerToolRenderers(pi, config);

    expect(registered.map((tool) => tool.name)).toEqual(["write"]);
  });

  it("leaves out tools the runtime does not expose", () => {
    const { pi, registered } = fakePi([
      { name: "write" },
      { name: "edit" },
      { name: "read" },
    ]);

    registerToolRenderers(pi, config);

    expect(registered.map((tool) => tool.name)).toEqual([
      "write",
      "edit",
      "read",
    ]);
  });

  it("is idempotent across repeated registrations", () => {
    const { pi, registered } = fakePi([{ name: "write" }]);

    registerToolRenderers(pi, config);
    registerToolRenderers(pi, config);

    expect(registered).toHaveLength(1);
  });

  it("describes a write whose preview could not be captured", async () => {
    const { pi, registered } = fakePi([{ name: "write" }]);
    registerToolRenderers(pi, config);
    const write = registered[0];

    const result = (await write.execute?.(
      "call-1",
      { path: "/tmp/workspace/a.txt", content: "next" },
      undefined,
      undefined,
      ctx,
    )) as { details?: { writeDiff?: { kind: string; summary?: string } } };

    expect(result.details?.writeDiff?.kind).toBe("summary");
    expect(result.details?.writeDiff?.summary).toContain(
      "could not be captured safely",
    );
  });

  it("registers shell-style renderers without native renderCall", () => {
    const { pi, registered } = fakePi([
      { name: "bash" },
      { name: "grep" },
      { name: "find" },
      { name: "ls" },
    ]);

    registerToolRenderers(pi, config);

    expect(registered).toHaveLength(4);
  });

  it("renders an empty call line for native tools without renderCall", () => {
    for (const name of ["bash", "grep", "find", "ls"]) {
      const { pi, registered } = fakePi([{ name }]);
      registerToolRenderers(pi, config);

      const rendered = registered[0].renderCall?.({}, theme, {}) as
        | { text: string }
        | undefined;

      expect(rendered?.text, name).toBe("");
    }
  });

  it("marks a read in progress", async () => {
    const { pi, registered } = fakePi([{ name: "read" }]);
    registerToolRenderers(pi, config);
    const read = registered[0];

    const rendered = read.renderResult?.(
      { content: [] },
      { expanded: false, isPartial: true },
      theme,
      { isError: false },
    ) as { text: string } | undefined;

    expect(rendered?.text).toBe("Reading...");
  });

  it("reports renderer registration failures without throwing", () => {
    const pi = {
      getAllTools: () => [{ name: "write", sourceInfo: { source: "builtin" } }],
      registerTool: () => {
        throw new Error("registration failed");
      },
    } as never;
    logError.mockClear();

    expect(() => registerToolRenderers(pi, config)).not.toThrow();
    expect(logError).toHaveBeenCalled();
  });
});
