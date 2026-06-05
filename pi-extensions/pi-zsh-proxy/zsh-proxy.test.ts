import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createLocalBashOperations: vi.fn(() => ({
    exec: mockExec,
  })),
}));

import { transformInput, createZshOperations } from "./zsh-proxy";

describe("transformInput", () => {
  it("transforms $cmd to !cmd", () => {
    expect(transformInput("$cmd")).toEqual({
      action: "transform",
      text: "!cmd",
    });
  });

  it("transforms $$cmd to !!cmd", () => {
    expect(transformInput("$$cmd")).toEqual({
      action: "transform",
      text: "!!cmd",
    });
  });

  it("transforms $ gst (with space) to !gst (trimmed)", () => {
    expect(transformInput("$ gst")).toEqual({
      action: "transform",
      text: "!gst",
    });
  });

  it("transforms $$  git status to !!git status", () => {
    expect(transformInput("$$  git status")).toEqual({
      action: "transform",
      text: "!!git status",
    });
  });

  it("returns continue for normal text", () => {
    expect(transformInput("hello world")).toEqual({
      action: "continue",
    });
  });

  it("returns continue for empty string", () => {
    expect(transformInput("")).toEqual({
      action: "continue",
    });
  });

  it("transforms $ alone to !", () => {
    expect(transformInput("$")).toEqual({
      action: "transform",
      text: "!",
    });
  });

  it("transforms $$ alone to !!", () => {
    expect(transformInput("$$")).toEqual({
      action: "transform",
      text: "!!",
    });
  });

  it("returns continue when $ is in middle of text", () => {
    expect(transformInput("price is $5")).toEqual({
      action: "continue",
    });
  });
});

describe("createZshOperations", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("wraps command with zsh -ic", async () => {
    const ops = createZshOperations();
    await ops.exec("echo hello", {});

    expect(mockExec).toHaveBeenCalledWith(
      "zsh -ic 'echo hello'",
      expect.anything(),
    );
  });

  it("preserves commands with spaces", async () => {
    const ops = createZshOperations();
    await ops.exec("git status", {});

    expect(mockExec).toHaveBeenCalledWith(
      "zsh -ic 'git status'",
      expect.anything(),
    );
  });

  it("passes options through", async () => {
    const ops = createZshOperations();
    const options = { timeout: 5000 };
    await ops.exec("ls", "/test", options);

    expect(mockExec).toHaveBeenCalledWith(
      "zsh -ic 'ls'",
      "/test",
      options,
    );
  });

  it("returns exec result", async () => {
    const expected = {
      output: "hello\n",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    };
    mockExec.mockResolvedValue(expected);

    const ops = createZshOperations();
    const result = await ops.exec("echo hello", {});

    expect(result).toEqual(expected);
  });
});
