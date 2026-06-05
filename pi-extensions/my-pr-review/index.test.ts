// index.test.ts
import { describe, it, expect, vi } from "vitest";
import myPrReview from "./index";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

describe("myPrReview", () => {
  it("registers 8 tools", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const toolCalls = vi.mocked(mockPi.registerTool).mock.calls;
    expect(toolCalls.length).toBe(8);

    const toolNames = toolCalls.map((c) => c[0].name);
    expect(toolNames).toContain("review_pr");
    expect(toolNames).toContain("review_tests");
    expect(toolNames).toContain("review_error_handling");
    expect(toolNames).toContain("review_code_quality");
    expect(toolNames).toContain("review_comments");
    expect(toolNames).toContain("review_type_design");
    expect(toolNames).toContain("review_simplification");
    expect(toolNames).toContain("save_review");
  });

  it("registers 2 commands", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const cmdCalls = vi.mocked(mockPi.registerCommand).mock.calls;
    expect(cmdCalls.length).toBe(2);

    const cmdNames = cmdCalls.map((c) => c[0]);
    expect(cmdNames).toContain("review-pr");
    expect(cmdNames).toContain("review-pr-cleanup");
  });

  it("registers session_shutdown handler for cleanup", () => {
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(),
      on: vi.fn(),
    } as unknown as ExtensionAPI;

    myPrReview(mockPi);

    const onCalls = vi.mocked(mockPi.on).mock.calls;
    const shutdownHandlers = onCalls.filter(
      (c) => c[0] === "session_shutdown"
    );
    expect(shutdownHandlers.length).toBe(1);
  });
});
