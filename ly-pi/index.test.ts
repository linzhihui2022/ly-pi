import { describe, expect, it, vi } from "vitest";

vi.mock("./my-back/index", () => ({ default: vi.fn() }));
vi.mock("./my-cd-guard/index", () => ({ cdGuard: vi.fn() }));
vi.mock("./my-diff/index", () => ({ default: vi.fn() }));
vi.mock("./my-html/index", () => ({ default: vi.fn() }));
vi.mock("./my-hud/index", () => ({ default: vi.fn() }));
vi.mock("./my-log/index", () => ({ default: vi.fn() }));
vi.mock("./my-model-policy/index", () => ({ default: vi.fn() }));
vi.mock("./my-permission/index", () => ({ default: vi.fn() }));
vi.mock("./my-reload/index", () => ({ default: vi.fn() }));
vi.mock("./my-script-guard/index", () => ({ scriptGuard: vi.fn() }));
vi.mock("./my-session-name/index", () => ({ default: vi.fn() }));
vi.mock("./my-sound/index", () => ({ default: vi.fn() }));
vi.mock("./my-tool-display/index", () => ({ default: vi.fn() }));
vi.mock("./my-vision/index", () => ({ default: vi.fn() }));
vi.mock("./my-worktree/index", () => ({ default: vi.fn() }));
vi.mock("./shared/guard-harness", () => ({ createGuardHarness: vi.fn() }));

import extension from "./index";
import myModelPolicy from "./my-model-policy/index";
import mySessionName from "./my-session-name/index";
import myToolDisplay from "./my-tool-display/index";
import myWorktree from "./my-worktree/index";

describe("ly-pi entry point", () => {
  it("registers the independent my-worktree extension", async () => {
    const pi = {};

    await extension(pi as never);

    expect(myModelPolicy).toHaveBeenCalledWith(pi);
    expect(mySessionName).toHaveBeenCalledWith(pi);
    expect(myToolDisplay).toHaveBeenCalledWith(pi);
    expect(myWorktree).toHaveBeenCalledWith(pi);
  });
});
