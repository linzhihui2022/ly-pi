import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../web-preview/preview", () => ({ servePreviewFile: vi.fn() }));
vi.mock("./stats", () => ({ collectJudgeLogs: vi.fn() }));
vi.mock("./cost-tracker", () => ({ aggregateCosts: vi.fn() }));
vi.mock("./cost-page", () => ({ renderCostPage: vi.fn(() => "<costs/>") }));
vi.mock("./log-page", () => ({ renderJudgeLogPage: vi.fn(() => "<logs/>") }));
vi.mock("./self-test", () => ({ runPermissionSelfTest: vi.fn() }));
vi.mock("./config", () => ({ config: { auditModel: "audit-model" } }));

import { servePreviewFile } from "../web-preview/preview";
import {
  createCourtCostsCommand,
  createJudgeLogCommand,
  createSelfTestCommand,
} from "./commands";
import { aggregateCosts } from "./cost-tracker";
import { runPermissionSelfTest } from "./self-test";
import { collectJudgeLogs } from "./stats";

function makeContext() {
  const notify = vi.fn();
  return {
    ctx: {
      cwd: "/repo",
      modelRegistry: { find: vi.fn(), complete: vi.fn() },
      sessionManager: {
        getEntries: () => [],
        getSessionId: () => "session-1",
      },
      ui: { notify },
    } as unknown as ExtensionCommandContext,
    notify,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("judge-log command", () => {
  it("reports an empty session log", async () => {
    vi.mocked(collectJudgeLogs).mockReturnValue([]);
    const { ctx, notify } = makeContext();

    await createJudgeLogCommand().handler("", ctx);

    expect(notify).toHaveBeenCalledWith("当前会话暂无法官判断", "info");
    expect(servePreviewFile).not.toHaveBeenCalled();
  });

  it("opens the judge log preview", async () => {
    vi.mocked(collectJudgeLogs).mockReturnValue([
      { toolName: "bash" },
    ] as never);
    vi.mocked(servePreviewFile).mockResolvedValue(
      "http://localhost:3456/judge-log.html",
    );
    const { ctx, notify } = makeContext();

    await createJudgeLogCommand().handler("", ctx);

    expect(servePreviewFile).toHaveBeenCalledWith(
      "session-1",
      "judge-log.html",
      "<logs/>",
    );
    expect(notify).toHaveBeenCalledWith(
      "Preview: http://localhost:3456/judge-log.html",
      "info",
    );
  });

  it("reports preview failures", async () => {
    vi.mocked(collectJudgeLogs).mockReturnValue([
      { toolName: "bash" },
    ] as never);
    vi.mocked(servePreviewFile).mockRejectedValue(new Error("port busy"));
    const { ctx, notify } = makeContext();

    await createJudgeLogCommand().handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Failed to start preview server: port busy",
      "error",
    );
  });
});

describe("court-costs command", () => {
  it("opens the costs preview", async () => {
    vi.mocked(aggregateCosts).mockReturnValue({} as never);
    vi.mocked(servePreviewFile).mockResolvedValue(
      "http://localhost:3456/court-costs.html",
    );
    const { ctx, notify } = makeContext();

    await createCourtCostsCommand().handler("", ctx);

    expect(aggregateCosts).toHaveBeenCalledWith("/repo");
    expect(servePreviewFile).toHaveBeenCalledWith(
      "session-1",
      "court-costs.html",
      "<costs/>",
    );
    expect(notify).toHaveBeenCalledWith(
      "Preview: http://localhost:3456/court-costs.html",
      "info",
    );
  });

  it("reports preview failures", async () => {
    vi.mocked(aggregateCosts).mockReturnValue({} as never);
    vi.mocked(servePreviewFile).mockRejectedValue(new Error("port busy"));
    const { ctx, notify } = makeContext();

    await createCourtCostsCommand().handler("", ctx);

    expect(notify).toHaveBeenCalledWith(
      "Failed to start preview server: port busy",
      "error",
    );
  });
});

describe("permission-self-test command", () => {
  it("passes the injected dependencies to the self test", async () => {
    vi.mocked(runPermissionSelfTest).mockResolvedValue({
      status: "success",
      report: "all good",
    } as never);
    const { ctx } = makeContext();

    await createSelfTestCommand({
      judgePrompt: "judge prompt",
      localJudge: "local rules",
    }).handler("", ctx);

    expect(runPermissionSelfTest).toHaveBeenCalledWith(
      expect.objectContaining({
        judgePrompt: "judge prompt",
        localJudge: "local rules",
      }),
    );
  });

  it("reports a successful self test", async () => {
    vi.mocked(runPermissionSelfTest).mockResolvedValue({
      status: "success",
      report: "all good",
    } as never);
    const { ctx, notify } = makeContext();

    await createSelfTestCommand({
      judgePrompt: "p",
      localJudge: "l",
    }).handler("", ctx);

    expect(notify).toHaveBeenCalledWith("all good", "info");
  });

  it("reports a failed self test", async () => {
    vi.mocked(runPermissionSelfTest).mockResolvedValue({
      status: "failure",
      error: "boom",
    } as never);
    const { ctx, notify } = makeContext();

    await createSelfTestCommand({
      judgePrompt: "p",
      localJudge: "l",
    }).handler("", ctx);

    expect(notify).toHaveBeenCalledWith("权限自测失败: boom", "error");
  });
});
