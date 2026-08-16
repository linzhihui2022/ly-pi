/**
 * Real delegation tests — unlike index.test.ts these do NOT mock
 * @earendil-works/pi-coding-agent. They drive the actual built-in tools
 * through my-compact's delegation layer to catch signature/cache drift
 * that mocks cannot see (e.g. missing ctx forwarding, shared cache).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

// Deterministic config: always on mode, writes swallowed.
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ mode: "on" })),
  writeFileSync: vi.fn(),
}));

import myZen from "./index";

interface CapturedTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate: undefined,
    ctx: { cwd: string },
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}

const tools = new Map<string, CapturedTool>();
const mockPi = {
  registerTool: vi.fn((def: CapturedTool) => tools.set(def.name, def)),
  registerCommand: vi.fn(),
  on: vi.fn(),
};

myZen(mockPi as unknown as ExtensionAPI);

const signal = new AbortController().signal;
const ctx = { cwd: process.cwd() };

function textOf(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content.find((c) => c.type === "text")?.text ?? "";
}

describe("my-zen real delegation", () => {
  it("read delegates to the real built-in tool", async () => {
    const read = tools.get("read");
    expect(read).toBeDefined();
    const result = await read!.execute(
      "t1",
      { path: "package.json" },
      signal,
      undefined,
      ctx,
    );
    expect(textOf(result)).toContain("ly-pi");
  });

  it("bash delegates to the real built-in tool after read ran (cache isolation)", async () => {
    // Regression: a shared per-cwd cache made this call receive the read
    // tool instance, crashing every non-first tool.
    const bash = tools.get("bash");
    expect(bash).toBeDefined();
    const result = await bash!.execute(
      "t2",
      { command: "echo my-compact-probe" },
      signal,
      undefined,
      ctx,
    );
    expect(textOf(result)).toContain("my-compact-probe");
  });

  it("edit delegates to the real built-in tool after read and bash ran", async () => {
    const edit = tools.get("edit");
    expect(edit).toBeDefined();
    // A no-match edit is enough: it exercises the real implementation and
    // must fail with the built-in's own error, not a delegation crash.
    await expect(
      edit!.execute(
        "t3",
        {
          path: "package.json",
          edits: [{ oldText: "zzz-no-such", newText: "x" }],
        },
        signal,
        undefined,
        ctx,
      ),
    ).rejects.toThrow();
  });
});
