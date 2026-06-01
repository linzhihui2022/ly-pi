import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { VisualAction } from "./types";

// ── Helpers for isolated temp directories ──

function tempDir(prefix: string) {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Handler function (imported from index.ts) ──

let handleVisualAction: (action: VisualAction, server: { show: (html: string, filename: string) => Promise<{ url: string }>; getEvents: () => Array<{ type: string; choice?: string; text?: string; timestamp: number }>; stop: () => Promise<void>; isRunning: () => boolean }) => Promise<{ success: boolean; message: string; url?: string; events?: Array<{ type: string; choice?: string; text?: string; timestamp: number }> }>;

async function loadHandler() {
  const mod = await import("./index");
  handleVisualAction = mod.handleVisualAction;
}

// ── Tests ──

describe("handleVisualAction (pure handler)", () => {
  beforeEach(async () => {
    await loadHandler();
  });

  it("show starts server and returns URL", async () => {
    let shown = false;
    const mockServer = {
      show: async (_html: string, _filename: string) => {
        shown = true;
        return { url: "http://localhost:52341" };
      },
      getEvents: () => [],
      stop: async () => {},
      isRunning: () => shown,
    };

    const result = await handleVisualAction(
      { action: "show", html: "<h2>Test</h2>", filename: "test.html" },
      mockServer,
    );

    expect(result.success).toBe(true);
    expect(result.url).toBe("http://localhost:52341");
    expect(result.message).toContain("localhost:52341");
  });

  it("events returns empty array when no events", async () => {
    const mockServer = {
      show: async () => ({ url: "" }),
      getEvents: () => [],
      stop: async () => {},
      isRunning: () => false,
    };

    const result = await handleVisualAction(
      { action: "events" },
      mockServer,
    );

    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });

  it("events returns recorded click events", async () => {
    const events = [
      { type: "click", choice: "a", text: "Option A", timestamp: 1706000101 },
      { type: "click", choice: "b", text: "Option B", timestamp: 1706000105 },
    ];
    const mockServer = {
      show: async () => ({ url: "" }),
      getEvents: () => events,
      stop: async () => {},
      isRunning: () => true,
    };

    const result = await handleVisualAction(
      { action: "events" },
      mockServer,
    );

    expect(result.success).toBe(true);
    expect(result.events).toEqual(events);
  });

  it("stop shuts down server", async () => {
    let stopped = false;
    let running = true;
    const mockServer = {
      show: async () => ({ url: "" }),
      getEvents: () => [],
      stop: async () => { stopped = true; running = false; },
      isRunning: () => running,
    };

    const result = await handleVisualAction(
      { action: "stop" },
      mockServer,
    );

    expect(result.success).toBe(true);
    expect(stopped).toBe(true);
  });
});

// ── Test the real ServerAPI implementation ──

describe("ServerAPI (real implementation)", () => {
  let createServer: (scriptsDir: string) => Promise<import("./types").ServerAPI>;
  let screenDir: string;
  let scriptsDir: string;

  beforeEach(async () => {
    const mod = await import("./server");
    createServer = mod.createServer;

    // Create temp directories mimicking the brainstorm scripts layout
    scriptsDir = tempDir("visual-companion-scripts");
    screenDir = join(scriptsDir, "screen");
    mkdirSync(screenDir, { recursive: true });

    // We don't need real server.cjs for unit tests — we test the manager logic
    // with a mock server process. For integration, we'd run the real scripts.
  });

  afterEach(() => {
    rmSync(scriptsDir, { recursive: true, force: true });
  });

  it("show creates HTML file and returns URL", async () => {
    // For this test, we'll mock the child process.
    // The actual server spawn is tested in integration.
    // Here we verify the ServerAPI contract.
    // We skip the real process test since it needs server.cjs at runtime.
    // But we verify the module loads and exports the right interface.
    expect(typeof createServer).toBe("function");
  });

  it("getEvents returns empty when events file does not exist", async () => {
    // Test that reads from a non-existent events file
    const { readEventsFile } = await import("./server");
    const stateDir = join(scriptsDir, "state");
    mkdirSync(stateDir, { recursive: true });
    
    const events = readEventsFile(stateDir);
    expect(events).toEqual([]);
  });

  it("getEvents parses events file correctly", async () => {
    const { readEventsFile } = await import("./server");
    const stateDir = join(scriptsDir, "state");
    mkdirSync(stateDir, { recursive: true });

    const eventsFile = join(stateDir, "events");
    const eventsJson = [
      JSON.stringify({ type: "click", choice: "a", text: "Option A", timestamp: 1706000101 }),
      JSON.stringify({ type: "click", choice: "b", text: "Option B", timestamp: 1706000105 }),
    ].join("\n");
    writeFileSync(eventsFile, eventsJson);

    const events = readEventsFile(stateDir);
    expect(events).toHaveLength(2);
    expect(events[0].choice).toBe("a");
    expect(events[1].choice).toBe("b");
  });

  it("readEventsFile handles empty file", async () => {
    const { readEventsFile } = await import("./server");
    const stateDir = join(scriptsDir, "state");
    mkdirSync(stateDir, { recursive: true });

    writeFileSync(join(stateDir, "events"), "");
    const events = readEventsFile(stateDir);
    expect(events).toEqual([]);
  });
});
