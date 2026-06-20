import { describe, it, expect } from "vitest";
import { parseGoalCommand } from "./goal-command";

describe("parseGoalCommand", () => {
  it("parses show from empty input", () => {
    expect(parseGoalCommand("")).toEqual({ kind: "show" });
  });

  it("parses show from whitespace only", () => {
    expect(parseGoalCommand("   ")).toEqual({ kind: "show" });
  });

  it("parses start objective", () => {
    expect(parseGoalCommand("fix bug")).toEqual({
      kind: "start",
      objective: "fix bug",
    });
  });

  it("preserves multi-word start objective", () => {
    expect(parseGoalCommand("refactor authentication service")).toEqual({
      kind: "start",
      objective: "refactor authentication service",
    });
  });

  it("parses edit objective", () => {
    expect(parseGoalCommand("edit fix bug")).toEqual({
      kind: "edit",
      objective: "fix bug",
    });
  });

  it("parses edit with multi-word objective", () => {
    expect(parseGoalCommand("edit refactor authentication service")).toEqual({
      kind: "edit",
      objective: "refactor authentication service",
    });
  });

  it("returns error for edit without objective", () => {
    expect(parseGoalCommand("edit")).toBe("Usage: /goal edit <objective>");
  });

  it("returns error for edit with only whitespace", () => {
    expect(parseGoalCommand("edit   ")).toBe("Usage: /goal edit <objective>");
  });

  it("parses pause", () => {
    expect(parseGoalCommand("pause")).toEqual({ kind: "pause" });
  });

  it("returns error for pause with extra args", () => {
    expect(parseGoalCommand("pause extra")).toBe("Usage: /goal pause");
  });

  it("parses resume", () => {
    expect(parseGoalCommand("resume")).toEqual({ kind: "resume" });
  });

  it("returns error for resume with extra args", () => {
    expect(parseGoalCommand("resume extra")).toBe("Usage: /goal resume");
  });

  it("parses clear", () => {
    expect(parseGoalCommand("clear")).toEqual({ kind: "clear" });
  });

  it("returns error for clear with extra args", () => {
    expect(parseGoalCommand("clear extra")).toBe("Usage: /goal clear");
  });

  it("trims whitespace around objective", () => {
    expect(parseGoalCommand("  fix bug  ")).toEqual({
      kind: "start",
      objective: "fix bug",
    });
  });
});
