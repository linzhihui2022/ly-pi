import { describe, it, expect, vi } from "vitest";
import { copyToClipboard } from "./clipboard";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("copyToClipboard", () => {
  it("calls pbcopy with text via stdin", () => {
    const mockExec = vi.mocked(execSync);
    copyToClipboard("hello world");
    expect(mockExec).toHaveBeenCalledWith("pbcopy", { input: "hello world", encoding: "utf-8" });
  });

  it("throws when pbcopy fails", () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockImplementation(() => {
      throw new Error("pbcopy: command not found");
    });
    expect(() => copyToClipboard("text")).toThrow("pbcopy: command not found");
  });
});
