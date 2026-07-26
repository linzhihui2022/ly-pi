import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import myHtml from "./index";

vi.mock("open", () => ({ default: vi.fn(() => Promise.resolve()) }));
vi.mock("web-preview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("web-preview")>();
  return {
    ...actual,
    ensurePreviewServer: vi.fn(() =>
      Promise.resolve({
        port: 3456,
        url: "http://localhost:3456",
        server: {} as unknown as Record<string, never>,
      }),
    ),
  };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { mkdirSync, writeFileSync } from "node:fs";
import open from "open";
import { ensurePreviewServer } from "web-preview";

describe("myHtml extension", () => {
  let registeredCommands: Map<
    string,
    { handler: (...args: unknown[]) => unknown }
  >;
  let registeredEvents: Map<string, (...args: unknown[]) => unknown>;
  let mockApi: ExtensionAPI;
  let mockCtx: ExtensionCommandContext;

  function mustGet<T>(map: Map<string, T>, key: string): T {
    const value = map.get(key);
    if (value === undefined)
      throw new Error(`Expected '${key}' to be registered`);
    return value;
  }

  beforeEach(() => {
    registeredCommands = new Map();
    registeredEvents = new Map();

    mockApi = {
      registerCommand: vi.fn((name, options) => {
        registeredCommands.set(name, options);
      }),
      on: vi.fn((event, handler) => {
        registeredEvents.set(event, handler);
      }),
    } as unknown as ExtensionAPI;

    mockCtx = {
      ui: {
        notify: vi.fn(),
      },
      sessionManager: {
        getEntries: vi.fn(),
        getSessionId: vi.fn(),
      },
    } as unknown as ExtensionCommandContext;
  });

  it("registers /html command", () => {
    myHtml(mockApi);
    expect(registeredCommands.has("html")).toBe(true);
  });

  it("registers session_shutdown handler", () => {
    myHtml(mockApi);
    expect(registeredEvents.has("session_shutdown")).toBe(true);
  });

  it("/html notifies error when no assistant message exists", async () => {
    myHtml(mockApi);
    const cmd = mustGet(registeredCommands, "html");

    mockCtx.sessionManager.getEntries = vi.fn(() => []);

    await cmd.handler("", mockCtx as ExtensionCommandContext);
    expect(mockCtx.ui?.notify).toHaveBeenCalledWith(
      "No agent reply to preview.",
      "warning",
    );
  });

  it("/html renders latest assistant reply, writes file and opens preview", async () => {
    myHtml(mockApi);
    const cmd = mustGet(registeredCommands, "html");

    mockCtx.sessionManager.getEntries = vi.fn(
      () =>
        [
          {
            id: "ignored",
            parentId: null,
            timestamp: new Date().toISOString(),
            type: "message",
            message: { role: "user", content: [{ type: "text", text: "hi" }] },
          },
          {
            id: "entry-42",
            parentId: "ignored",
            timestamp: new Date().toISOString(),
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "# Hello\n\nWorld" }],
            },
          },
        ] as unknown as SessionEntry[],
    );
    mockCtx.sessionManager.getSessionId = vi.fn(() => "session-xyz");

    await cmd.handler("", mockCtx as ExtensionCommandContext);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("session-xyz"),
      { recursive: true },
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("entry-42.html"),
      expect.stringContaining("<h1>Hello</h1>"),
      "utf-8",
    );
    expect(ensurePreviewServer).toHaveBeenCalledWith({
      host: "127.0.0.1",
      urlHost: "localhost",
      port: 3456,
    });
    expect(open).toHaveBeenCalledWith(
      "http://localhost:3456/session-xyz/entry-42.html",
    );
    expect(mockCtx.ui?.notify).toHaveBeenCalledWith(
      "Preview: http://localhost:3456/session-xyz/entry-42.html",
      "info",
    );
  });

  it("/html uses thinking content when no text is present", async () => {
    myHtml(mockApi);
    const cmd = mustGet(registeredCommands, "html");

    mockCtx.sessionManager.getEntries = vi.fn(
      () =>
        [
          {
            id: "entry-43",
            parentId: null,
            timestamp: new Date().toISOString(),
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "thinking", thinking: "some thought" }],
            },
          },
        ] as unknown as SessionEntry[],
    );
    mockCtx.sessionManager.getSessionId = vi.fn(() => "session-abc");

    await cmd.handler("", mockCtx as ExtensionCommandContext);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("entry-43.html"),
      expect.stringContaining("some thought"),
      "utf-8",
    );
  });

  it("/html notifies error when preview server fails to start", async () => {
    myHtml(mockApi);
    const cmd = mustGet(registeredCommands, "html");

    mockCtx.sessionManager.getEntries = vi.fn(
      () =>
        [
          {
            id: "entry-44",
            parentId: null,
            timestamp: new Date().toISOString(),
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "hello" }],
            },
          },
        ] as unknown as SessionEntry[],
    );
    mockCtx.sessionManager.getSessionId = vi.fn(() => "session-err");
    vi.mocked(ensurePreviewServer).mockRejectedValueOnce(
      new Error("port in use"),
    );

    await cmd.handler("", mockCtx as ExtensionCommandContext);

    expect(mockCtx.ui?.notify).toHaveBeenCalledWith(
      "Failed to start preview server: port in use",
      "error",
    );
  });
});
