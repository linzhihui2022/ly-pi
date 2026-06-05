import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExec = vi.fn();
const mockSendUserMessage = vi.fn();
const mockNotify = vi.fn();

const { mockTransformInput, mockCreateZshOperations } = vi.hoisted(() => ({
  mockTransformInput: vi.fn((text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("$$")) {
      return { action: "transform", text: "!!" + trimmed.slice(2).trim() };
    }
    if (trimmed.startsWith("$")) {
      return { action: "transform", text: "!" + trimmed.slice(1).trim() };
    }
    return { action: "continue" };
  }),
  mockCreateZshOperations: vi.fn(() => ({ exec: mockExec })),
}));

vi.mock("./zsh-proxy", () => ({
  transformInput: mockTransformInput,
  createZshOperations: mockCreateZshOperations,
}));

async function loadModule() {
  return import("./index");
}

const registeredEvents = new Map<string, (...args: any[]) => any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  sendUserMessage: mockSendUserMessage,
};

const mockCtx = {
  ui: { notify: mockNotify },
  cwd: "/test",
};

describe("pi-zsh-proxy extension", () => {
  beforeEach(() => {
    registeredEvents.clear();
    mockExec.mockReset();
    mockSendUserMessage.mockReset();
    mockNotify.mockReset();
    mockPi.on.mockClear();
    vi.resetModules();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers input handler", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);
    expect(mockPi.on).toHaveBeenCalledWith("input", expect.any(Function));
  });

  it("returns handled for $cmd and sends result to LLM", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockResolvedValue({
      output: "git status output",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });

    const result = await handler({ text: "$gst" }, mockCtx);

    expect(mockExec).toHaveBeenCalledWith("gst", "/test");
    expect(mockSendUserMessage).toHaveBeenCalledWith("$ gst\ngit status output");
    expect(result).toEqual({ action: "handled" });
  });

  it("returns handled for $$cmd and shows result without sending to LLM", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockResolvedValue({
      output: "git status output",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });

    const result = await handler({ text: "$$gst" }, mockCtx);

    expect(mockExec).toHaveBeenCalledWith("gst", "/test");
    expect(mockSendUserMessage).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith("git status output", "info");
    expect(result).toEqual({ action: "handled" });
  });

  it("returns continue for non-$ text", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    const result = await handler({ text: "hello" }, mockCtx);

    expect(mockExec).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "continue" });
  });

  it("warns when $ has no command", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    const result = await handler({ text: "$" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("$: no command provided", "warn");
    expect(mockExec).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "handled" });
  });

  it("warns when $$ has no command", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    const result = await handler({ text: "$$" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("$$: no command provided", "warn");
    expect(mockExec).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "handled" });
  });

  it("notifies error when $ command exits non-zero", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockResolvedValue({
      output: "error output",
      exitCode: 1,
      cancelled: false,
      truncated: false,
    });

    const result = await handler({ text: "$badcmd" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("Exit code: 1", "error");
    expect(mockSendUserMessage).toHaveBeenCalledWith("$ badcmd\nerror output");
    expect(result).toEqual({ action: "handled" });
  });

  it("notifies error when $$ command exits non-zero", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockResolvedValue({
      output: "error output",
      exitCode: 1,
      cancelled: false,
      truncated: false,
    });

    const result = await handler({ text: "$$badcmd" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("Exit code: 1", "error");
    expect(mockNotify).toHaveBeenCalledWith("error output", "error");
    expect(mockSendUserMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "handled" });
  });

  it("notifies error when exec throws", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockRejectedValue(new Error("exec failed"));

    const result = await handler({ text: "$cmd" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("Error: exec failed", "error");
    expect(result).toEqual({ action: "handled" });
  });

  it("handles empty output", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockResolvedValue({
      output: "",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    });

    const result = await handler({ text: "$echo" }, mockCtx);

    expect(mockSendUserMessage).toHaveBeenCalledWith("$ echo\n(no output)");
    expect(result).toEqual({ action: "handled" });
  });

  it("handles non-Error thrown value", async () => {
    const mod = await loadModule();
    mod.default(mockPi as any);

    const handler = registeredEvents.get("input");
    mockExec.mockRejectedValue("string error");

    const result = await handler({ text: "$cmd" }, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith("Error: string error", "error");
    expect(result).toEqual({ action: "handled" });
  });
});
