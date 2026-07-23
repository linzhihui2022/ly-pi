import { describe, expect, test, vi } from "vitest";
import { buildPrompt, createJudge, parseVerdict } from "./judge";
import type {
  AuthorizerLog,
  PermissionQuery,
  PromptPermissionDetails,
} from "./types";

describe("buildPrompt", () => {
  test("includes all provided fields", () => {
    const details: PromptPermissionDetails = {
      requestId: "req-1",
      source: "tool_call",
      agentName: "coder",
      message: "Run ls",
      surface: "bash",
      value: "ls -la",
      command: "ls -la",
      toolInputPreview: '{"path": "/tmp"}',
    };

    const prompt = buildPrompt(details);

    expect(prompt.system).toContain("allow");
    expect(prompt.user).toContain("bash");
    expect(prompt.user).toContain("ls -la");
    expect(prompt.user).toContain("coder");
    expect(prompt.user).toContain("Run ls");
    expect(prompt.user).toContain('{"path": "/tmp"}');
  });

  test("uses surface and value when command is absent", () => {
    const details: PromptPermissionDetails = {
      requestId: "req-2",
      source: "tool_call",
      agentName: null,
      message: "Read file",
      surface: "read",
      value: "/etc/passwd",
      toolInputPreview: '{"path": "/etc/passwd"}',
    };

    const prompt = buildPrompt(details);

    expect(prompt.user).toContain("read");
    expect(prompt.user).toContain("/etc/passwd");
    expect(prompt.user).not.toContain("command");
  });

  test("falls back to toolName when surface is absent", () => {
    const details: PromptPermissionDetails = {
      requestId: "req-3",
      source: "tool_call",
      agentName: null,
      message: "Tool call",
      toolName: "my-tool",
      toolInputPreview: '{"x": 1}',
    };

    const prompt = buildPrompt(details);

    expect(prompt.user).toContain("my-tool");
    expect(prompt.user).toContain("tool");
  });

  test("handles missing optional fields gracefully", () => {
    const details: PromptPermissionDetails = {
      requestId: "req-4",
      source: "tool_call",
      agentName: null,
      message: "Minimal",
    };

    const prompt = buildPrompt(details);

    expect(prompt.user).toContain("unknown");
    expect(prompt.user).toContain("Minimal");
  });
});

describe("parseVerdict", () => {
  test("parses plain JSON allow", () => {
    expect(parseVerdict('{"decision":"allow"}')).toEqual({
      decision: "allow",
    });
  });

  test("parses plain JSON defer", () => {
    expect(parseVerdict('{"decision":"defer","reason":"unsure"}')).toEqual({
      decision: "defer",
      reason: "unsure",
    });
  });

  test("maps deny to defer", () => {
    expect(parseVerdict('{"decision":"deny","reason":"unsafe"}')).toEqual({
      decision: "defer",
      reason: "unsafe",
    });
  });

  test("maps deny without reason to defer", () => {
    expect(parseVerdict('{"decision":"deny"}')).toEqual({
      decision: "defer",
    });
  });

  test("parses fenced JSON", () => {
    expect(
      parseVerdict(
        'Here is my verdict:\n```json\n{"decision":"defer","reason":"unsure"}\n```',
      ),
    ).toEqual({
      decision: "defer",
      reason: "unsure",
    });
  });

  test("parses JSON embedded in prose", () => {
    expect(
      parseVerdict('I think {"decision":"defer"} is the right call.'),
    ).toEqual({
      decision: "defer",
    });
  });

  test("returns null for invalid JSON", () => {
    expect(parseVerdict("not json")).toBeNull();
  });

  test("returns null when extracted text is not valid JSON", () => {
    expect(parseVerdict("{not json}")).toBeNull();
  });

  test("returns null for invalid decision", () => {
    expect(parseVerdict('{"decision":"maybe"}')).toBeNull();
  });

  test("drops non-string reason", () => {
    expect(parseVerdict('{"decision":"defer","reason":123}')).toEqual({
      decision: "defer",
    });
  });
});

describe("createJudge", () => {
  function makeLog(): AuthorizerLog {
    return {
      review: vi.fn(),
      debug: vi.fn(),
    };
  }

  function makeDetails(): PromptPermissionDetails {
    return {
      requestId: "req-1",
      source: "tool_call",
      agentName: "coder",
      message: "Run ls",
      surface: "bash",
      value: "ls -la",
      command: "ls -la",
    };
  }

  function makeQuery(): PermissionQuery {
    return {} as unknown as PermissionQuery;
  }

  test("returns allow and notifies when review says allow", async () => {
    const review = vi.fn().mockResolvedValue('{"decision":"allow"}');
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "allow" });
    expect(review).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("[my-judge] AI 评审已放行", "info");
    expect(log.review).toHaveBeenCalledWith(
      "my-judge",
      expect.objectContaining({ decision: "allow" }),
    );
  });

  test("returns allow with reason in notify", async () => {
    const review = vi
      .fn()
      .mockResolvedValue(
        '{"decision":"allow","reason":"safe read-only command"}',
      );
    const notify = vi.fn();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), makeLog());

    expect(result).toEqual({ kind: "allow" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已放行: safe read-only command",
      "info",
    );
  });

  test("returns defer and notifies when review says defer", async () => {
    const review = vi
      .fn()
      .mockResolvedValue('{"decision":"defer","reason":"unsure"}');
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认: unsure",
      "warning",
    );
  });

  test("returns defer and notifies when review says defer without reason", async () => {
    const review = vi
      .fn()
      .mockResolvedValue('{"decision":"defer"}');
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认",
      "warning",
    );
  });

  test("maps deny to defer and notifies", async () => {
    const review = vi
      .fn()
      .mockResolvedValue('{"decision":"deny","reason":"unsafe"}');
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认: unsafe",
      "warning",
    );
  });

  test("returns defer and notifies on unparseable verdict", async () => {
    const review = vi.fn().mockResolvedValue("nope");
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认: 无法解析评审结果",
      "warning",
    );
    expect(log.debug).toHaveBeenCalledWith(
      "my-judge:parse-failed",
      expect.objectContaining({ raw: "nope" }),
    );
  });

  test("returns defer and notifies when review throws", async () => {
    const review = vi.fn().mockRejectedValue(new Error("timeout"));
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认: timeout",
      "warning",
    );
    expect(log.debug).toHaveBeenCalledWith(
      "my-judge:error",
      expect.objectContaining({ error: "timeout" }),
    );
  });

  test("returns defer and notifies when review throws a non-Error", async () => {
    const review = vi.fn().mockRejectedValue("timeout");
    const notify = vi.fn();
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalledWith(
      "[my-judge] AI 评审已回退人工确认: timeout",
      "warning",
    );
    expect(log.debug).toHaveBeenCalledWith(
      "my-judge:error",
      expect.objectContaining({ error: "timeout" }),
    );
  });

  test("swallows notify errors and still returns defer", async () => {
    const review = vi.fn().mockResolvedValue('{"decision":"defer","reason":"unsure"}');
    const notify = vi.fn().mockImplementation(() => {
      throw new Error("ui down");
    });
    const log = makeLog();
    const judge = createJudge(review, notify);

    const result = await judge(makeDetails(), makeQuery(), log);

    expect(result).toEqual({ kind: "defer" });
    expect(notify).toHaveBeenCalled();
  });

  test("returns defer without notify when notify is not provided", async () => {
    const review = vi.fn().mockResolvedValue('{"decision":"defer","reason":"unsure"}');
    const judge = createJudge(review);

    const result = await judge(makeDetails(), makeQuery(), makeLog());

    expect(result).toEqual({ kind: "defer" });
  });
});
