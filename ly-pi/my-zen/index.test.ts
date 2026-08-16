import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock pi-tui Text ────────────────────────────────────────────────────────
vi.mock("@earendil-works/pi-tui", () => ({
  Text: class MockText {
    constructor(
      public text: string,
      public paddingX = 0,
      public paddingY = 0,
    ) {}
    render(width?: number) {
      const raw = this.text.split("\n");
      if (!width) return raw;
      // naive hard wrap so width regression tests exercise real behavior
      const out: string[] = [];
      for (const line of raw) {
        if (line.length === 0) {
          out.push("");
          continue;
        }
        for (let i = 0; i < line.length; i += width) {
          out.push(line.slice(i, i + width));
        }
      }
      return out;
    }
    setText(t: string) {
      this.text = t;
    }
    invalidate() {}
  },
  visibleWidth: (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length,
  truncateToWidth: (s: string, w: number) => s.slice(0, w),
}));

// ── Mock fs: path-aware, switchable contents; writes are captured ───────────
let zenConfigContent = JSON.stringify({ mode: "on" });
let toolDisplayConfigContent: string | undefined = JSON.stringify({
  debug: false,
  registerToolOverrides: {
    read: false,
    grep: false,
    find: false,
    ls: false,
    bash: false,
    edit: false,
    write: false,
  },
  mcpOutputMode: "hidden",
});
const writtenFiles: Array<{ path: string; data: string }> = [];

vi.mock("node:fs", () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes("my-zen")) return zenConfigContent;
    if (path.includes("pi-tool-display")) {
      if (toolDisplayConfigContent === undefined) {
        throw new Error("ENOENT");
      }
      return toolDisplayConfigContent;
    }
    throw new Error("ENOENT");
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    writtenFiles.push({ path, data });
  }),
}));

// ── Mock built-in tool factories ────────────────────────────────────────────
class MockUserMessageComponent {
  outputPad = 1;
  children: Array<{
    paddingY: number;
    bgFn: (line: string) => string;
    invalidateCache: () => void;
  }> = [];
  rebuild() {
    // mimic the native rebuild: creates Box(outputPad, paddingY=1, bg)
    this.children = [
      {
        paddingY: 1,
        bgFn: (s: string) => `[bg]${s}[/bg]`,
        invalidateCache: () => {},
      },
    ];
  }
}

const builtInExecute = vi.fn(async () => ({
  content: [{ type: "text", text: "built-in result" }],
  details: {},
}));

function makeBuiltIn(description: string) {
  return {
    description,
    label: description,
    parameters: { type: "object" },
    promptSnippet: `${description} snippet`,
    promptGuidelines: [`${description} guidelines`],
    execute: builtInExecute,
  };
}

vi.mock("@earendil-works/pi-coding-agent", async () => {
  return {
    createReadTool: vi.fn(() => makeBuiltIn("read")),
    createBashTool: vi.fn(() => makeBuiltIn("bash")),
    createEditTool: vi.fn(() => makeBuiltIn("edit")),
    createWriteTool: vi.fn(() => makeBuiltIn("write")),
    createGrepTool: vi.fn(() => makeBuiltIn("grep")),
    createFindTool: vi.fn(() => makeBuiltIn("find")),
    createLsTool: vi.fn(() => makeBuiltIn("ls")),
    UserMessageComponent: MockUserMessageComponent,
  };
});

// ── Capture registered tools/commands ───────────────────────────────────────
interface ToolDef {
  name: string;
  renderShell?: string;
  description: string;
  promptSnippet?: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
  renderCall: (
    args: Record<string, unknown>,
    theme: unknown,
    context: { isPartial?: boolean; expanded?: boolean },
  ) => { render: (w: number) => string[] };
  renderResult: (
    result: unknown,
    options: { expanded: boolean; isPartial: boolean },
    theme: unknown,
    context: { isError?: boolean },
  ) => { render: (w: number) => string[] };
}

interface CommandDef {
  description: string;
  handler: (args: string, ctx: never) => Promise<void>;
}

const registeredTools = new Map<string, ToolDef>();
const registeredCommands = new Map<string, CommandDef>();
type EventHandler = (event: never, ctx: never) => unknown;
const eventHandlers = new Map<string, EventHandler[]>();
const mockPi = {
  registerTool: vi.fn((def: ToolDef) => {
    registeredTools.set(def.name, def);
  }),
  registerCommand: vi.fn((name: string, def: CommandDef) => {
    registeredCommands.set(name, def);
  }),
  on: vi.fn((event: string, handler: EventHandler) => {
    const list = eventHandlers.get(event) ?? [];
    list.push(handler);
    eventHandlers.set(event, list);
  }),
};

async function emit(event: string, e: unknown, ctx: unknown) {
  for (const h of eventHandlers.get(event) ?? []) {
    await h(e as never, ctx as never);
  }
}

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

const okResult = (text: string) => ({
  content: [{ type: "text", text }],
  details: {},
});

const makeCtx = () => ({
  ui: { notify: vi.fn() },
  reload: vi.fn(async () => {}),
});

beforeEach(() => {
  registeredTools.clear();
  registeredCommands.clear();
  eventHandlers.clear();
  writtenFiles.length = 0;
  // restore the native rebuild between tests (patches are prototype-global)
  MockUserMessageComponent.prototype.rebuild = function (this: {
    children: Array<{
      paddingY: number;
      bgFn: (line: string) => string;
      invalidateCache: () => void;
    }>;
  }) {
    this.children = [
      {
        paddingY: 1,
        bgFn: (s: string) => `[bg]${s}[/bg]`,
        invalidateCache: () => {},
      },
    ];
  };
  zenConfigContent = JSON.stringify({ mode: "on" });
  toolDisplayConfigContent = JSON.stringify({
    debug: false,
    registerToolOverrides: { read: false, write: false },
    mcpOutputMode: "hidden",
  });
  vi.clearAllMocks();
});

async function initExtension() {
  const mod = await import("./index");
  mod.default(mockPi as unknown as ExtensionAPI);
}

function zenCommand(): CommandDef {
  const cmd = registeredCommands.get("zen");
  if (!cmd) throw new Error("/zen not registered");
  return cmd;
}

describe("my-zen extension (on mode)", () => {
  it("registers overrides for all seven built-in tools", async () => {
    await initExtension();
    expect([...registeredTools.keys()].sort()).toEqual([
      "bash",
      "edit",
      "find",
      "grep",
      "ls",
      "read",
      "write",
    ]);
  });

  it("uses self renderShell for compact rows", async () => {
    await initExtension();
    for (const [name, def] of registeredTools) {
      expect(def.renderShell, name).toBe("self");
    }
  });

  it("preserves built-in description, parameters and prompt metadata", async () => {
    await initExtension();
    const read = registeredTools.get("read");
    expect(read?.description).toBe("read");
    expect(read?.parameters).toEqual({ type: "object" });
    expect(read?.promptSnippet).toBe("read snippet");
  });

  it("delegates execute to the built-in tool with all five arguments", async () => {
    await initExtension();
    const read = registeredTools.get("read");
    const signal = new AbortController().signal;
    const onUpdate = () => {};
    const ctx = { cwd: process.cwd() };
    const result = await read?.execute(
      "tc1",
      { path: "/tmp/a" },
      signal,
      onUpdate,
      ctx,
    );
    // Regression: dropping the 5th argument (ctx) crashed real built-in tools.
    expect(builtInExecute).toHaveBeenCalledWith(
      "tc1",
      { path: "/tmp/a" },
      signal,
      onUpdate,
      ctx,
    );
    expect(result).toEqual(okResult("built-in result"));
  });

  describe("renderCall", () => {
    it("renders zero lines once settled and collapsed", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderCall({ path: "/tmp/a.ts" }, theme, {
        isPartial: false,
        expanded: false,
      });
      expect(component?.render(120)).toHaveLength(0);
    });

    it("renders one summary line while running", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderCall(
        { path: `${process.env.HOME}/x.ts` },
        theme,
        { isPartial: true, expanded: false },
      );
      const lines = component?.render(120);
      expect(lines).toHaveLength(1);
      expect(lines?.[0]).toContain("read");
      expect(lines?.[0]).toContain("~/x.ts");
    });

    it("shows line range for read offset/limit while running", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderCall(
        { path: "/tmp/a.ts", offset: 10, limit: 20 },
        theme,
        { isPartial: true, expanded: false },
      );
      expect(component?.render(120)[0]).toContain(":10-29");
    });

    it("flattens multi-line bash command to one line while running", async () => {
      await initExtension();
      const bash = registeredTools.get("bash");
      const component = bash?.renderCall({ command: "echo a\necho b" }, theme, {
        isPartial: true,
        expanded: false,
      });
      const lines = component?.render(120);
      expect(lines).toHaveLength(1);
      expect(lines?.[0]).toContain("echo a ; echo b");
    });

    it("renders one summary line when expanded", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderCall({ path: "/tmp/a.ts" }, theme, {
        isPartial: false,
        expanded: true,
      });
      expect(component?.render(120)).toHaveLength(1);
    });
  });

  describe("user message rebuild patch", () => {
    it("drops the Box vertical padding while keeping horizontal padding", async () => {
      await initExtension();
      const proto = MockUserMessageComponent.prototype;
      const instance = new MockUserMessageComponent();
      proto.rebuild.call(instance);
      // the hardcoded paddingY=1 blank rows are removed...
      expect(instance.children[0]?.paddingY).toBe(0);
      // ...while outputPad (the horizontal padding = left color edge) stays
      expect(instance.outputPad).toBe(1);
    });

    it("restores the native rebuild on session shutdown with reason reload", async () => {
      await initExtension();
      const proto = MockUserMessageComponent.prototype;
      await emit("session_shutdown", { reason: "reload" }, {});
      const instance = new MockUserMessageComponent();
      proto.rebuild.call(instance);
      expect(instance.children[0]?.paddingY).toBe(1);
    });

    it("keeps the patch on session shutdown for other reasons", async () => {
      await initExtension();
      const proto = MockUserMessageComponent.prototype;
      const patched = proto.rebuild;
      await emit("session_shutdown", { reason: "quit" }, {});
      expect(proto.rebuild).toBe(patched);
    });

    it("replaces the left padding column with an accent bar once themed", async () => {
      await initExtension();
      const markedTheme = {
        fg: (c: string, t: string) => `<${c}>${t}</>`,
        bg: (c: string, t: string) => `[${c}]${t}[/${c}]`,
        bold: (t: string) => t,
      };
      await emit("session_start", {}, { ui: { theme: markedTheme } });
      const proto = MockUserMessageComponent.prototype;
      const instance = new MockUserMessageComponent();
      proto.rebuild.call(instance);
      const box = instance.children[0];
      const out = box?.bgFn(" 帮我修 bug   ");
      expect(out).toBe(
        "[userMessageBg]<accent>▎</>帮我修 bug   [/userMessageBg]",
      );
    });

    it("falls back to the original bgFn when no theme is cached", async () => {
      await initExtension();
      // reset any theme cached by earlier tests
      await emit("session_start", {}, { ui: { theme: undefined } });
      const proto = MockUserMessageComponent.prototype;
      const instance = new MockUserMessageComponent();
      proto.rebuild.call(instance);
      const box = instance.children[0];
      expect(box?.bgFn(" hello ")).toBe("[bg] hello [/bg]");
    });

    it("keeps the line width when outputPad is 0", async () => {
      await initExtension();
      await emit("session_start", {}, { ui: { theme } });
      const proto = MockUserMessageComponent.prototype;
      const instance = new MockUserMessageComponent();
      instance.outputPad = 0;
      proto.rebuild.call(instance);
      const out = instance.children[0]?.bgFn("xxxx");
      expect(out).toBe("▎xxx");
    });
  });

  describe("renderResult", () => {
    it("renders zero lines on success", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderResult(
        okResult("file contents"),
        { expanded: false, isPartial: false },
        theme,
        {},
      );
      expect(component?.render(120)).toHaveLength(0);
    });

    it("renders zero lines while partial", async () => {
      await initExtension();
      const bash = registeredTools.get("bash");
      const component = bash?.renderResult(
        okResult(""),
        { expanded: false, isPartial: true },
        theme,
        {},
      );
      expect(component?.render(120)).toHaveLength(0);
    });

    it("renders one error line when isError", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderResult(
        okResult("Error: file not found\nstack trace"),
        { expanded: false, isPartial: false },
        theme,
        { isError: true },
      );
      const lines = component?.render(120);
      expect(lines).toHaveLength(1);
      expect(lines?.[0]).toContain("Error: file not found");
    });

    it("renders exit code line for failed bash command", async () => {
      await initExtension();
      const bash = registeredTools.get("bash");
      const component = bash?.renderResult(
        okResult("boom\nexit code: 2"),
        { expanded: false, isPartial: false },
        theme,
        {},
      );
      const lines = component?.render(120);
      expect(lines).toHaveLength(1);
      expect(lines?.[0]).toContain("exit 2");
    });

    it("renders zero lines for successful bash command", async () => {
      await initExtension();
      const bash = registeredTools.get("bash");
      const component = bash?.renderResult(
        okResult("ok\nexit code: 0"),
        { expanded: false, isPartial: false },
        theme,
        {},
      );
      expect(component?.render(120)).toHaveLength(0);
    });

    it("shows full output when expanded", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderResult(
        okResult("line1\nline2\nline3"),
        { expanded: true, isPartial: false },
        theme,
        {},
      );
      const lines = component?.render(120);
      expect(lines?.join("\n")).toContain("line1");
      expect(lines?.join("\n")).toContain("line3");
    });

    it("shows image notice for read image content", async () => {
      await initExtension();
      const read = registeredTools.get("read");
      const component = read?.renderResult(
        { content: [{ type: "image", data: "x", mimeType: "image/png" }] },
        { expanded: true, isPartial: false },
        theme,
        {},
      );
      expect(component?.render(120).join("\n")).toContain("image");
    });
  });
});

describe("my-zen extension (off mode)", () => {
  beforeEach(() => {
    zenConfigContent = JSON.stringify({ mode: "off" });
  });

  it("registers no tool overrides, only the /zen command", async () => {
    await initExtension();
    expect(registeredTools.size).toBe(0);
    expect(registeredCommands.get("zen")).toBeDefined();
  });

  it("does not patch the user message rebuild", async () => {
    await initExtension();
    const instance = new MockUserMessageComponent();
    MockUserMessageComponent.prototype.rebuild.call(instance);
    expect(instance.outputPad).toBe(1);
  });

  it("bare /zen toggles back to on, writes both configs and reloads", async () => {
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("", ctx as never);

    const zenWrite = writtenFiles.find((f) => f.path.includes("my-zen"));
    expect(JSON.parse(zenWrite?.data ?? "{}")).toEqual({ mode: "on" });

    const displayWrite = writtenFiles.find((f) =>
      f.path.includes("pi-tool-display"),
    );
    const overrides = JSON.parse(
      displayWrite?.data ?? "{}",
    ).registerToolOverrides;
    expect(Object.values(overrides)).toHaveLength(7);
    expect(Object.values(overrides).every((v) => v === false)).toBe(true);

    expect(ctx.reload).toHaveBeenCalled();
  });
});

describe("/zen command", () => {
  it("bare /zen toggles on → off, writing both configs and reloading", async () => {
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("", ctx as never);

    const zenWrite = writtenFiles.find((f) => f.path.includes("my-zen"));
    expect(JSON.parse(zenWrite?.data ?? "{}")).toEqual({ mode: "off" });

    const displayWrite = writtenFiles.find((f) =>
      f.path.includes("pi-tool-display"),
    );
    const parsed = JSON.parse(displayWrite?.data ?? "{}");
    expect(Object.values(parsed.registerToolOverrides)).toHaveLength(7);
    expect(
      Object.values(parsed.registerToolOverrides).every((v) => v === true),
    ).toBe(true);
    // unrelated keys are preserved
    expect(parsed.mcpOutputMode).toBe("hidden");

    expect(ctx.reload).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("off"),
      "info",
    );
  });

  it("rejects an unknown mode without side effects", async () => {
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("invisible", ctx as never);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("on / off"),
      "warning",
    );
    expect(writtenFiles).toHaveLength(0);
    expect(ctx.reload).not.toHaveBeenCalled();
  });

  it("does nothing when already in the requested mode", async () => {
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("on", ctx as never);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("已是"),
      "info",
    );
    expect(writtenFiles).toHaveLength(0);
    expect(ctx.reload).not.toHaveBeenCalled();
  });

  it("switches to off explicitly, same as a bare toggle from on", async () => {
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("off", ctx as never);

    const zenWrite = writtenFiles.find((f) => f.path.includes("my-zen"));
    expect(JSON.parse(zenWrite?.data ?? "{}")).toEqual({ mode: "off" });
    expect(ctx.reload).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("off"),
      "info",
    );
  });

  it("still switches when pi-tool-display config is missing", async () => {
    toolDisplayConfigContent = undefined;
    await initExtension();
    const ctx = makeCtx();
    await zenCommand().handler("off", ctx as never);

    const zenWrite = writtenFiles.find((f) => f.path.includes("my-zen"));
    expect(zenWrite).toBeDefined();
    expect(writtenFiles.some((f) => f.path.includes("pi-tool-display"))).toBe(
      false,
    );
    expect(ctx.reload).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("pi-tool-display"),
      "warning",
    );
  });
});
