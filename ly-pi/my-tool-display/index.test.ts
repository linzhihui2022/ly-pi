import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReadToolDefinition,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createReadToolDefinition: vi.fn(),
  getAgentDir: vi.fn(),
}));

import myToolDisplay from "./index";

let agentDir: string;
const nativeExecutions = new Map<string, ReturnType<typeof vi.fn>>();
const nativeResult = {
  content: [{ type: "text", text: "native result" }],
  details: undefined,
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

function writeConfig(contents: string): void {
  const configDir = join(agentDir, "extensions", "ly-pi");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "my-tool-display.json"), contents);
}

function setup(source = "builtin") {
  const tools = [
    {
      name: "read",
      sourceInfo: { source },
    },
  ];
  const registered: any[] = [];
  const pi = {
    getAllTools: vi.fn(() => tools),
    registerTool: vi.fn((tool: any) => {
      registered.push(tool);
      tools[0] = { name: "read", sourceInfo: { source: "extension" } };
    }),
  };

  myToolDisplay(pi as never);

  return { pi, registered };
}

beforeEach(() => {
  nativeExecutions.clear();
  agentDir = mkdtempSync(join(tmpdir(), "my-tool-display-"));
  vi.mocked(getAgentDir).mockReturnValue(agentDir);
  vi.mocked(createReadToolDefinition).mockImplementation(
    (cwd) => createNativeReadDefinition(cwd) as never,
  );
});

afterEach(() => {
  rmSync(agentDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("my-tool-display", () => {
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
