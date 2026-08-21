import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import mySessionName from "./index";
import {
  buildForkSessionName,
  SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
} from "./session-name";
import { requestSessionTitle } from "./title";

vi.mock("./title", () => ({
  requestSessionTitle: vi.fn(),
}));

const requestSessionTitleMock = vi.mocked(requestSessionTitle);
type Handler = (event: any, ctx: ExtensionContext) => unknown;
const handlers = new Map<string, Handler>();
let currentName: string | undefined;

const mockPi = {
  on: vi.fn((event: string, handler: Handler) => {
    handlers.set(event, handler);
  }),
  getSessionName: vi.fn(() => currentName),
  setSessionName: vi.fn((name: string) => {
    currentName = name;
  }),
  appendEntry: vi.fn(),
};

function asEntries(entries: unknown[]): SessionEntry[] {
  return entries as SessionEntry[];
}

function createContext(
  entries: SessionEntry[] = [],
  sessionId = "child-session-1",
): ExtensionContext {
  return {
    sessionManager: {
      getEntries: () => entries,
      getSessionId: () => sessionId,
    },
  } as unknown as ExtensionContext;
}

function inputEvent(source: "interactive" | "rpc" | "extension") {
  return { type: "input", source, text: "原始输入" };
}

function beforeEvent(prompt: string) {
  return { type: "before_agent_start", prompt };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  handlers.clear();
  currentName = undefined;
  vi.clearAllMocks();
  mySessionName(mockPi as unknown as ExtensionAPI);
});

describe("session naming lifecycle", () => {
  it("generates a title from the expanded prompt for interactive input", async () => {
    requestSessionTitleMock.mockResolvedValue("修复登录");
    const ctx = createContext();

    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("展开后的任务"), ctx);
    await flushPromises();

    expect(requestSessionTitleMock).toHaveBeenCalledWith("展开后的任务", ctx);
    expect(mockPi.appendEntry).toHaveBeenCalledWith(
      SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
      { sessionId: "child-session-1" },
    );
    expect(mockPi.setSessionName).toHaveBeenCalledWith("修复登录");
  });

  it("reports a model policy loading error without naming the session", async () => {
    requestSessionTitleMock.mockRejectedValue(new Error("invalid manifest"));
    const notify = vi.fn();
    const ctx = {
      ...createContext(),
      ui: { notify },
    } as unknown as ExtensionContext;

    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("任务"), ctx);
    await flushPromises();

    expect(notify).toHaveBeenCalledWith(
      "会话标题模型策略加载失败: invalid manifest",
      "error",
    );
    expect(mockPi.setSessionName).not.toHaveBeenCalled();
  });

  it("accepts rpc input and skips extension-injected input", async () => {
    requestSessionTitleMock.mockResolvedValue("RPC 任务");
    const ctx = createContext();

    await handlers.get("input")!(inputEvent("extension"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("扩展内容"), ctx);
    expect(requestSessionTitleMock).not.toHaveBeenCalled();

    await handlers.get("input")!(inputEvent("rpc"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("RPC 任务"), ctx);
    await flushPromises();
    expect(requestSessionTitleMock).toHaveBeenCalledWith("RPC 任务", ctx);
  });

  it("does not replace a user-set name", async () => {
    currentName = "手动名称";
    const ctx = createContext();

    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("任务"), ctx);
    await flushPromises();

    expect(requestSessionTitleMock).not.toHaveBeenCalled();
    expect(mockPi.setSessionName).not.toHaveBeenCalled();
  });

  it.each([
    "startup",
    "reload",
    "resume",
  ] as const)("backfills an unnamed session on %s from its first user prompt", async (reason) => {
    requestSessionTitleMock.mockResolvedValue("旧任务");
    const ctx = createContext(
      asEntries([
        {
          type: "message",
          message: { role: "user", content: "旧 session 的任务" },
        },
      ]),
    );

    await handlers.get("session_start")!({ reason }, ctx);
    await flushPromises();

    expect(requestSessionTitleMock).toHaveBeenCalledWith(
      "旧 session 的任务",
      ctx,
    );
    expect(mockPi.setSessionName).toHaveBeenCalledWith("旧任务");
  });

  it("waits for the first user input in a new session", async () => {
    requestSessionTitleMock.mockResolvedValue("新任务");
    const ctx = createContext();

    await handlers.get("session_start")!({ reason: "new" }, ctx);
    expect(requestSessionTitleMock).not.toHaveBeenCalled();

    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("新任务"), ctx);
    await flushPromises();
    expect(requestSessionTitleMock).toHaveBeenCalledWith("新任务", ctx);
  });

  it("does not retry a marked title attempt after reload", async () => {
    const ctx = createContext(
      asEntries([
        {
          type: "custom",
          customType: SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
          data: { sessionId: "child-session-1" },
        },
        { type: "message", message: { role: "user", content: "旧任务" } },
      ]),
    );

    await handlers.get("session_start")!({ reason: "reload" }, ctx);

    expect(requestSessionTitleMock).not.toHaveBeenCalled();
    expect(mockPi.appendEntry).not.toHaveBeenCalled();
  });

  it("adds the child session hash when a fork starts", async () => {
    currentName = "父任务";
    const ctx = createContext([], "child-session-1");

    await handlers.get("session_start")!({ reason: "fork" }, ctx);

    expect(mockPi.setSessionName).toHaveBeenCalledWith(
      buildForkSessionName("父任务", "child-session-1"),
    );
    expect(requestSessionTitleMock).not.toHaveBeenCalled();
  });

  it("uses the parent session's latest name when the fork point predates it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "my-session-name-"));
    const parentSessionFile = join(directory, "parent.jsonl");
    await writeFile(
      parentSessionFile,
      [
        JSON.stringify({ type: "session", id: "parent-session" }),
        JSON.stringify({ type: "session_info", name: "父会话最新名称" }),
      ].join("\n"),
    );
    const ctx = createContext([], "child-session-1");

    await handlers.get("session_start")!(
      { reason: "fork", previousSessionFile: parentSessionFile },
      ctx,
    );

    expect(mockPi.setSessionName).toHaveBeenCalledWith("父会话最新名称-79a3a1");
    expect(requestSessionTitleMock).not.toHaveBeenCalled();
  });

  it("generates a base name before adding the hash for an unnamed fork", async () => {
    requestSessionTitleMock.mockResolvedValue("分支任务");
    const ctx = createContext(
      asEntries([
        { type: "message", message: { role: "user", content: "父任务内容" } },
      ]),
      "child-session-1",
    );

    await handlers.get("session_start")!({ reason: "fork" }, ctx);
    await flushPromises();

    expect(requestSessionTitleMock).toHaveBeenCalledWith("父任务内容", ctx);
    expect(mockPi.setSessionName).toHaveBeenCalledWith("分支任务-79a3a1");
  });

  it("does not overwrite a manual name while a title request is pending", async () => {
    let resolveTitle!: (title: string) => void;
    requestSessionTitleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTitle = resolve;
      }),
    );
    const ctx = createContext();

    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("任务"), ctx);
    currentName = "用户后来设置的名称";
    resolveTitle("自动标题");
    await flushPromises();

    expect(mockPi.setSessionName).not.toHaveBeenCalled();
  });

  it("ignores a title result after the session changes", async () => {
    let resolveTitle!: (title: string) => void;
    requestSessionTitleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTitle = resolve;
      }),
    );
    const oldCtx = createContext(
      asEntries([
        { type: "message", message: { role: "user", content: "旧任务" } },
      ]),
      "old-session",
    );
    const newCtx = createContext([], "new-session");

    await handlers.get("session_start")!({ reason: "resume" }, oldCtx);
    await handlers.get("session_start")!({ reason: "new" }, newCtx);
    resolveTitle("旧标题");
    await flushPromises();

    expect(mockPi.setSessionName).not.toHaveBeenCalled();
  });

  it("consumes input sources in order when inputs interleave", async () => {
    requestSessionTitleMock.mockResolvedValue("用户标题");
    const ctx = createContext();

    await handlers.get("input")!(inputEvent("extension"), ctx);
    await handlers.get("input")!(inputEvent("interactive"), ctx);
    await handlers.get("before_agent_start")!(beforeEvent("扩展输入"), ctx);
    expect(requestSessionTitleMock).not.toHaveBeenCalled();

    await handlers.get("before_agent_start")!(beforeEvent("用户输入"), ctx);
    await flushPromises();
    expect(requestSessionTitleMock).toHaveBeenCalledWith("用户输入", ctx);
  });

  it("does not re-add a fork suffix on resume after manual rename", async () => {
    currentName = "手动分支名";
    const ctx = createContext([], "child-session-1");

    await handlers.get("session_start")!({ reason: "resume" }, ctx);

    expect(mockPi.setSessionName).not.toHaveBeenCalled();
  });
});
