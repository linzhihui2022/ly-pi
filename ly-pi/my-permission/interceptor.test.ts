import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({ config: {} }));
vi.mock("./rules", () => ({ decide: vi.fn() }));
vi.mock("./judge", () => ({ createJudge: vi.fn() }));
vi.mock("./ui", () => ({
  confirmToolCall: vi.fn(),
  createSessionCache: vi.fn(),
}));
vi.mock("./cost-tracker", () => ({ appendCost: vi.fn() }));
vi.mock("./stats", () => ({
  recordJudgeStats: vi.fn(),
  recordUserOverride: vi.fn(),
}));
vi.mock("./utils", () => ({
  collectPaths: vi.fn(() => []),
  resolveSymlinkedPaths: vi.fn(() => []),
  stringifyToolInput: vi.fn(() => "value"),
}));

import { appendCost } from "./cost-tracker";
import { createToolCallInterceptor } from "./interceptor";
import { createJudge } from "./judge";
import { decide } from "./rules";
import { recordJudgeStats, recordUserOverride } from "./stats";
import { confirmToolCall } from "./ui";

function makeCache(approved = false) {
  return {
    isApproved: vi.fn(() => approved),
    approve: vi.fn(),
  };
}

function makeDeps(overrides: Partial<{ child: boolean }> = {}) {
  const cache = makeCache();
  return {
    pi: { appendEntry: vi.fn() } as unknown as ExtensionAPI,
    judgePrompt: "judge prompt",
    localJudge: "local rules",
    cache,
    child: overrides.child ?? false,
  };
}

function makeContext(hasUI = true) {
  return {
    cwd: "/repo",
    hasUI,
    modelRegistry: { find: vi.fn(), complete: vi.fn() },
    sessionManager: { getSessionId: () => "session-1" },
    ui: { confirm: vi.fn() },
  } as unknown as ExtensionContext;
}

const event = {
  toolName: "bash",
  input: { command: "rm -rf /" },
} as unknown as ToolCallEvent;

function judgeReturning(result: unknown) {
  vi.mocked(createJudge).mockReturnValue(
    vi.fn().mockResolvedValue(result) as never,
  );
}

/** The interceptor always builds the judge; this asserts it is never invoked. */
function judgeNeverInvoked() {
  const judge = vi.fn();
  vi.mocked(createJudge).mockReturnValue(judge as never);
  return judge;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(decide).mockReturnValue({ action: "ask" } as never);
});

describe("createToolCallInterceptor", () => {
  it("passes through when a deterministic rule allows the call", async () => {
    const judge = judgeNeverInvoked();
    vi.mocked(decide).mockReturnValue({ action: "allow" } as never);

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(),
    );

    expect(result).toBeUndefined();
    expect(judge).not.toHaveBeenCalled();
  });

  it("blocks with the rule reason when a deterministic rule denies", async () => {
    const judge = judgeNeverInvoked();
    vi.mocked(decide).mockReturnValue({
      action: "deny",
      reason: "matched dangerous rule",
      source: "rules",
    } as never);

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(),
    );

    expect(result).toEqual({ block: true, reason: "matched dangerous rule" });
    expect(judge).not.toHaveBeenCalled();
  });

  it("falls back to the rule source when a denial carries no reason", async () => {
    vi.mocked(decide).mockReturnValue({
      action: "deny",
      source: "dangerous-pattern",
    } as never);

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(),
    );

    expect(result).toEqual({
      block: true,
      reason: "Blocked by dangerous-pattern",
    });
  });

  it("passes through a call the session already approved", async () => {
    const deps = makeDeps();
    const judge = judgeNeverInvoked();
    deps.cache.isApproved = vi.fn(() => true);

    const result = await createToolCallInterceptor(deps)(event, makeContext());

    expect(result).toBeUndefined();
    expect(deps.cache.isApproved).toHaveBeenCalledWith("bash:value");
    expect(judge).not.toHaveBeenCalled();
  });

  it("passes through a call the judge found safe and records the cost", async () => {
    judgeReturning({ safe: true, cost: 0.001, modelUsed: "judge-model" });

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(),
    );

    expect(result).toBeUndefined();
    expect(recordJudgeStats).toHaveBeenCalled();
    expect(appendCost).toHaveBeenCalledWith(
      "session-1",
      "/repo",
      "judge",
      0.001,
      "judge-model",
    );
  });

  it("skips cost bookkeeping when the judge reports no model", async () => {
    judgeReturning({ safe: true });

    await createToolCallInterceptor(makeDeps())(event, makeContext());

    expect(appendCost).not.toHaveBeenCalled();
  });

  it("blocks an unsafe call without a UI", async () => {
    judgeReturning({ safe: false, reason: "unsafe command" });

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(false),
    );

    expect(result).toEqual({ block: true, reason: "unsafe command" });
    expect(confirmToolCall).not.toHaveBeenCalled();
  });

  it("blocks an unsafe call in a child session", async () => {
    judgeReturning({ safe: false, reason: "unsafe command" });

    const result = await createToolCallInterceptor(makeDeps({ child: true }))(
      event,
      makeContext(),
    );

    expect(result).toEqual({ block: true, reason: "unsafe command" });
    expect(confirmToolCall).not.toHaveBeenCalled();
  });

  it("remembers the approval when the user confirms an unsafe call", async () => {
    const deps = makeDeps();
    judgeReturning({
      safe: false,
      reason: "needs review",
      score: 4,
      toolFor: "rm -rf /",
    });
    vi.mocked(confirmToolCall).mockResolvedValue(true);

    const result = await createToolCallInterceptor(deps)(event, makeContext());

    expect(result).toBeUndefined();
    expect(deps.cache.approve).toHaveBeenCalledWith("bash:value");
    expect(recordUserOverride).toHaveBeenCalledWith(deps.pi, {
      toolName: "bash",
      value: "value",
      paths: [],
    });
  });

  it("blocks with the denial reason when the user rejects an unsafe call", async () => {
    judgeReturning({ safe: false, reason: "needs review" });
    vi.mocked(confirmToolCall).mockResolvedValue(false);

    const result = await createToolCallInterceptor(makeDeps())(
      event,
      makeContext(),
    );

    expect(result).toEqual({
      block: true,
      reason: "User denied: needs review",
    });
  });
});
