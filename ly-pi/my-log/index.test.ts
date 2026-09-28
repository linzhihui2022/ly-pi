import { beforeEach, describe, expect, it, vi } from "vitest";

const { servePreviewFile, stopPreviewServer } = vi.hoisted(() => ({
  servePreviewFile: vi.fn(),
  stopPreviewServer: vi.fn(),
}));

vi.mock("../web-preview/preview", () => ({
  servePreviewFile,
  stopPreviewServer,
}));

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type SessionEntry = {
  type: string;
  customType?: string;
  data?: unknown;
  timestamp?: string;
};

type CommandDefinition = {
  handler: (args: string | undefined, ctx: ExtensionContext) => Promise<void>;
};

function makePi() {
  const commands = new Map<string, CommandDefinition>();
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const appended: Array<{ customType: string; data: unknown }> = [];
  const emitted: Array<{ name: string; payload: unknown }> = [];

  const pi = {
    appendEntry: (customType: string, data: unknown) => {
      appended.push({ customType, data });
    },
    events: {
      emit: (name: string, payload: unknown) => {
        emitted.push({ name, payload });
      },
    },
    on: (name: string, handler: (...args: unknown[]) => unknown) => {
      events.set(name, handler);
    },
    registerCommand: (name: string, definition: CommandDefinition) => {
      commands.set(name, definition);
    },
  };

  return {
    pi: pi as unknown as ExtensionAPI,
    commands,
    events,
    appended,
    emitted,
  };
}

function makeCtx(entries: SessionEntry[] = []) {
  const notify = vi.fn();
  const ctx = {
    sessionManager: {
      getEntries: () => entries,
      getSessionId: () => "session-1",
    },
    ui: { notify },
  } as unknown as ExtensionContext;
  return { ctx, notify };
}

async function loadModule() {
  vi.resetModules();
  const module = await import("./index");
  return { myLog: module.default, createDevLogger: module.createDevLogger };
}

beforeEach(() => {
  servePreviewFile.mockReset();
  stopPreviewServer.mockReset();
  stopPreviewServer.mockResolvedValue(undefined);
});

describe("my-log entry point", () => {
  it("registers the command and lifecycle hooks", async () => {
    const { myLog } = await loadModule();
    const { pi, commands, events } = makePi();

    myLog(pi);

    expect([...commands.keys()]).toEqual(["ly-log"]);
    expect([...events.keys()]).toEqual(["session_start", "session_shutdown"]);
  });

  it("drops log writes while logging is disabled", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, appended } = makePi();
    myLog(pi);

    createDevLogger("test-source").info("hello");

    expect(appended).toHaveLength(0);
  });

  it("writes entries after logging is switched on", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, commands, appended, emitted } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx();

    await commands.get("ly-log")?.handler("on", ctx);

    expect(appended[0]).toEqual({
      customType: "ly-log-config",
      data: { enabled: true },
    });
    expect(notify).toHaveBeenCalledWith("日志已开启", "info");
    expect(emitted).toEqual([
      { name: "ly-log:toggle", payload: { enabled: true } },
    ]);

    createDevLogger("test-source").info("hello");

    const logEntry = appended.find((entry) => entry.customType === "ly-log");
    expect(logEntry?.data).toMatchObject({
      level: "info",
      source: "test-source",
      msg: "hello",
    });
  });

  it("stops writing after logging is switched off", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, commands, appended, emitted } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx();

    await commands.get("ly-log")?.handler("on", ctx);
    await commands.get("ly-log")?.handler("off", ctx);
    createDevLogger("test-source").info("after-off");

    expect(appended.at(-1)).toEqual({
      customType: "ly-log-config",
      data: { enabled: false },
    });
    expect(notify).toHaveBeenCalledWith("日志已关闭", "info");
    expect(emitted.at(-1)).toEqual({
      name: "ly-log:toggle",
      payload: { enabled: false },
    });
  });

  it("restores an enabled state recorded in the session", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, events, appended } = makePi();
    myLog(pi);
    const { ctx } = makeCtx([
      { type: "custom", customType: "ly-log-config", data: { enabled: true } },
    ]);

    await events.get("session_start")?.({}, ctx);
    createDevLogger("test-source").warn("restored");

    expect(appended.some((entry) => entry.customType === "ly-log")).toBe(true);
  });

  it("restores a disabled state recorded in the session", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, events, appended } = makePi();
    myLog(pi);
    const { ctx } = makeCtx([
      { type: "custom", customType: "ly-log-config", data: { enabled: true } },
      { type: "custom", customType: "ly-log-config", data: { enabled: false } },
    ]);

    await events.get("session_start")?.({}, ctx);
    createDevLogger("test-source").warn("should be dropped");

    expect(appended).toHaveLength(0);
  });

  it("stays disabled when the session has no configuration", async () => {
    const { myLog, createDevLogger } = await loadModule();
    const { pi, events, appended } = makePi();
    myLog(pi);
    const { ctx } = makeCtx([{ type: "message" }]);

    await events.get("session_start")?.({}, ctx);
    createDevLogger("test-source").warn("should be dropped");

    expect(appended).toHaveLength(0);
  });

  it("emits the restored toggle state on session start", async () => {
    const { myLog } = await loadModule();
    const { pi, events, emitted } = makePi();
    myLog(pi);
    const { ctx } = makeCtx();

    await events.get("session_start")?.({}, ctx);

    expect(emitted).toEqual([
      { name: "ly-log:toggle", payload: { enabled: false } },
    ]);
  });

  it("stops the preview server on shutdown", async () => {
    const { myLog } = await loadModule();
    const { pi, events } = makePi();
    myLog(pi);

    await events.get("session_shutdown")?.();

    expect(stopPreviewServer).toHaveBeenCalledTimes(1);
  });

  it("reports an empty session log", async () => {
    const { myLog } = await loadModule();
    const { pi, commands } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx();

    await commands.get("ly-log")?.handler(undefined, ctx);

    expect(notify).toHaveBeenCalledWith(
      "当前会话暂无日志记录。使用 /ly-log on 开启。",
      "info",
    );
    expect(servePreviewFile).not.toHaveBeenCalled();
  });

  it("ignores malformed log entries", async () => {
    const { myLog } = await loadModule();
    const { pi, commands } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx([
      { type: "custom", customType: "ly-log", data: { level: 42 } },
      { type: "custom", customType: "ly-log", data: undefined },
    ]);

    await commands.get("ly-log")?.handler("  ", ctx);

    expect(notify).toHaveBeenCalledWith(
      "当前会话暂无日志记录。使用 /ly-log on 开启。",
      "info",
    );
  });

  it("opens the log page for collected entries", async () => {
    const { myLog } = await loadModule();
    servePreviewFile.mockResolvedValue("http://localhost:3456/ly-log.html");
    const { pi, commands } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx([
      {
        type: "custom",
        customType: "ly-log",
        data: {
          level: "info",
          source: "my-sound",
          msg: "played",
          data: { pack: "peon" },
        },
        timestamp: "2026-09-28T00:00:00.000Z",
      },
      { type: "custom", customType: "other" },
    ]);

    await commands.get("ly-log")?.handler(undefined, ctx);

    expect(servePreviewFile).toHaveBeenCalledWith(
      "session-1",
      "ly-log.html",
      expect.stringContaining("my-sound"),
    );
    expect(notify).toHaveBeenCalledWith(
      "Preview: http://localhost:3456/ly-log.html",
      "info",
    );
  });

  it("reports preview failures", async () => {
    const { myLog } = await loadModule();
    servePreviewFile.mockRejectedValue(new Error("port busy"));
    const { pi, commands } = makePi();
    myLog(pi);
    const { ctx, notify } = makeCtx([
      {
        type: "custom",
        customType: "ly-log",
        data: { level: "info", source: "s", msg: "m" },
        timestamp: "2026-09-28T00:00:00.000Z",
      },
    ]);

    await commands.get("ly-log")?.handler(undefined, ctx);

    expect(notify).toHaveBeenCalledWith(
      "Failed to start preview server: port busy",
      "error",
    );
  });
});
