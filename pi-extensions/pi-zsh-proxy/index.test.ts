import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const { mockTransformInput, mockCreateZshOperations } = vi.hoisted(() => ({
  mockTransformInput: vi.fn(),
  mockCreateZshOperations: vi.fn(),
}));

vi.mock("./zsh-proxy", () => ({
  transformInput: mockTransformInput,
  createZshOperations: mockCreateZshOperations,
}));

async function loadModule() {
  return import("./index");
}

function createMockPi(): ExtensionAPI {
  return {
    on: vi.fn(),
  } as unknown as ExtensionAPI;
}

describe("index.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a default function", async () => {
    const mod = await loadModule();
    expect(typeof mod.default).toBe("function");
  });

  it("registers input handler", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);
    expect(pi.on).toHaveBeenCalledWith("input", expect.any(Function));
  });

  it("registers user_bash handler", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);
    expect(pi.on).toHaveBeenCalledWith("user_bash", expect.any(Function));
  });

  it("input handler delegates to transformInput for $cmd", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);

    const inputHandler = vi.mocked(pi.on).mock.calls.find(
      ([event]) => event === "input"
    )?.[1] as (event: { text: string }) => any;

    mockTransformInput.mockReturnValue({ action: "transform", text: "!gst" });
    const result = await inputHandler({ text: "$gst" });

    expect(mockTransformInput).toHaveBeenCalledWith("$gst");
    expect(result).toEqual({ action: "transform", text: "!gst" });
  });

  it("input handler returns continue for non-$ text", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);

    const inputHandler = vi.mocked(pi.on).mock.calls.find(
      ([event]) => event === "input"
    )?.[1] as (event: { text: string }) => any;

    mockTransformInput.mockReturnValue({ action: "continue" });
    const result = await inputHandler({ text: "hello" });

    expect(mockTransformInput).toHaveBeenCalledWith("hello");
    expect(result).toEqual({ action: "continue" });
  });

  it("input handler transforms $$cmd", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);

    const inputHandler = vi.mocked(pi.on).mock.calls.find(
      ([event]) => event === "input"
    )?.[1] as (event: { text: string }) => any;

    mockTransformInput.mockReturnValue({ action: "transform", text: "!!gst" });
    const result = await inputHandler({ text: "$$gst" });

    expect(mockTransformInput).toHaveBeenCalledWith("$$gst");
    expect(result).toEqual({ action: "transform", text: "!!gst" });
  });

  it("user_bash handler returns operations object", async () => {
    const mod = await loadModule();
    const pi = createMockPi();
    mod.default(pi);

    const userBashHandler = vi.mocked(pi.on).mock.calls.find(
      ([event]) => event === "user_bash"
    )?.[1] as () => any;

    const mockOperations = { exec: vi.fn() };
    mockCreateZshOperations.mockReturnValue(mockOperations);
    const result = userBashHandler();

    expect(mockCreateZshOperations).toHaveBeenCalled();
    expect(result).toEqual({ operations: mockOperations });
  });
});
