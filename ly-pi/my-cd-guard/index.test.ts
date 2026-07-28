import { describe, expect, it, vi } from "vitest";
import { cdGuard } from "./index";

describe("cdGuard", () => {
  describe("name", () => {
    it("has name 'cd-guard'", () => {
      expect(cdGuard.name).toBe("cd-guard");
    });
  });

  describe("onBeforeAgentStart", () => {
    it("augments system prompt with cwd hint", () => {
      const result = cdGuard.onBeforeAgentStart?.("Existing prompt.", "/repo");
      expect(result).toContain("Existing prompt.");
      expect(result).toContain("/repo");
      expect(result).toContain("CRITICAL");
    });
  });

  describe("detect", () => {
    it("detects redundant cd prefix", () => {
      const result = cdGuard.detect("cd /repo && git status", "/repo");
      expect(result).toBeDefined();
      expect(result!.command).toBe("git status");
    });

    it("returns undefined for non-redundant cd", () => {
      const result = cdGuard.detect("cd /other && ls", "/repo");
      expect(result).toBeUndefined();
    });

    it("returns undefined for normal commands", () => {
      const result = cdGuard.detect("git status", "/repo");
      expect(result).toBeUndefined();
    });
  });

  describe("react", () => {
    it("mutates event.input.command and notifies when UI is available", () => {
      const event = {
        toolName: "bash" as const,
        input: { command: "cd /repo && git status" },
      };
      const ctx = {
        hasUI: true,
        cwd: "/repo",
        ui: { notify: vi.fn() },
      };
      const detection = { command: "git status", stripped: "cd /repo &&" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cdGuard.react(detection, event as any, ctx as any);
      expect(event.input.command).toBe("git status");
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("cd /repo"),
        "info",
      );
    });

    it("rewrites silently when UI is unavailable", () => {
      const event = {
        toolName: "bash" as const,
        input: { command: "cd /repo && ls" },
      };
      const ctx = {
        hasUI: false,
        cwd: "/repo",
        ui: { notify: vi.fn() },
      };
      const detection = { command: "ls", stripped: "cd /repo &&" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cdGuard.react(detection, event as any, ctx as any);
      expect(event.input.command).toBe("ls");
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });
  });
});
