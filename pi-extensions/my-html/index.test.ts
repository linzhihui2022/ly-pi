import { describe, it, expect, vi, beforeEach } from "vitest";
import myHtml from "./index";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

describe("myHtml extension", () => {
  let registeredCommands: Map<string, any>;
  let registeredEvents: Map<string, any>;
  let mockApi: ExtensionAPI;
  let mockCtx: Partial<ExtensionCommandContext>;

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
    } as any;

    mockCtx = {
      ui: {
        notify: vi.fn(),
      } as any,
      sessionManager: {
        getEntries: vi.fn(),
      } as any,
    };
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
    const cmd = registeredCommands.get("html");

    mockCtx.sessionManager!.getEntries = vi.fn(() => []);

    await cmd.handler("", mockCtx as ExtensionCommandContext);
    expect(mockCtx.ui!.notify).toHaveBeenCalledWith(
      "No agent reply to preview.",
      "warning",
    );
  });
});
