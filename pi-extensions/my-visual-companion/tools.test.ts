import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTools } from "./tools";
import { SessionManager } from "./session";

describe("createTools", () => {
  let manager: SessionManager;
  let tools: ReturnType<typeof createTools>;

  beforeEach(() => {
    manager = new SessionManager({ idleTimeoutMs: 30_000 });
    tools = createTools(manager, { host: "127.0.0.1", urlHost: "localhost" });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it("has all 4 tools", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("visual_companion_start");
    expect(names).toContain("visual_companion_show");
    expect(names).toContain("visual_companion_read_events");
    expect(names).toContain("visual_companion_stop");
  });

  it("start tool returns session info", async () => {
    const startTool = tools.find((t) => t.name === "visual_companion_start")!;
    const result = await startTool.execute("tc-1", {}, undefined, undefined, {} as any);
    const details = result.details as any;
    expect(details.sessionId).toBeTruthy();
    expect(details.port).toBeGreaterThan(0);
  });

  it("show tool returns success after start", async () => {
    const startTool = tools.find((t) => t.name === "visual_companion_start")!;
    const showTool = tools.find((t) => t.name === "visual_companion_show")!;

    const startResult = await startTool.execute("tc-1", {}, undefined, undefined, {} as any);
    const sessionId = (startResult.details as any).sessionId;

    const result = await showTool.execute("tc-2", { session_id: sessionId, name: "layout", html: "<h1>Hi</h1>" }, undefined, undefined, {} as any);
    expect(result.details).toEqual({ success: true });
  });

  it("show tool returns error for bad session", async () => {
    const showTool = tools.find((t) => t.name === "visual_companion_show")!;
    const result = await showTool.execute("tc-2", { session_id: "bad", name: "layout", html: "<h1>Hi</h1>" }, undefined, undefined, {} as any);
    expect((result.details as any).error).toContain("Session not found");
  });

  it("read_events tool returns events", async () => {
    const startTool = tools.find((t) => t.name === "visual_companion_start")!;
    const readTool = tools.find((t) => t.name === "visual_companion_read_events")!;

    const startResult = await startTool.execute("tc-1", {}, undefined, undefined, {} as any);
    const sessionId = (startResult.details as any).sessionId;

    manager.appendEvent(sessionId, { type: "click", text: "hi", timestamp: 1 });

    const result = await readTool.execute("tc-3", { session_id: sessionId }, undefined, undefined, {} as any);
    expect((result.details as any).events).toHaveLength(1);
  });

  it("read_events tool returns empty when no events", async () => {
    const startTool = tools.find((t) => t.name === "visual_companion_start")!;
    const readTool = tools.find((t) => t.name === "visual_companion_read_events")!;

    const startResult = await startTool.execute("tc-1", {}, undefined, undefined, {} as any);
    const sessionId = (startResult.details as any).sessionId;

    const result = await readTool.execute("tc-3", { session_id: sessionId }, undefined, undefined, {} as any);
    expect(result.content[0].text).toBe("No events yet.");
    expect((result.details as any).events).toHaveLength(0);
  });

  it("read_events tool returns error for bad session", async () => {
    const readTool = tools.find((t) => t.name === "visual_companion_read_events")!;
    const result = await readTool.execute("tc-3", { session_id: "bad" }, undefined, undefined, {} as any);
    expect((result.details as any).error).toContain("Session not found");
  });

  it("stop tool destroys session", async () => {
    const startTool = tools.find((t) => t.name === "visual_companion_start")!;
    const stopTool = tools.find((t) => t.name === "visual_companion_stop")!;

    const startResult = await startTool.execute("tc-1", {}, undefined, undefined, {} as any);
    const sessionId = (startResult.details as any).sessionId;

    await stopTool.execute("tc-4", { session_id: sessionId }, undefined, undefined, {} as any);
    expect(manager.get(sessionId)).toBeUndefined();
  });
});
