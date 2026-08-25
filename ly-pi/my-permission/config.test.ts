import { describe, expect, it } from "vitest";
import { config } from "./config";

describe("config", () => {
  it("has sensible defaults", () => {
    expect(config.defaultPolicy).toBe("allow");
    expect(config.judgeModel).toBe("openai-codex/gpt-5.6-luna");
    expect(config.professorModel).toBe("openai-codex/gpt-5.6-sol");
    expect(config.professorThinking).toBe("high");
    expect(config.judgeTimeoutMs).toBe(8000);
    expect(config.childPolicy).toBe("deny-on-unsafe");
  });

  it("has non-empty permission map", () => {
    expect(config.permission).toBeTruthy();
    expect(typeof config.permission).toBe("object");
    expect(Object.keys(config.permission).length).toBeGreaterThan(0);
  });

  it("has permission.ask_user_question set to allow", () => {
    expect(config.permission.ask_user_question).toBe("allow");
  });

  it("has permission.todo set to allow", () => {
    expect(config.permission.todo).toBe("allow");
  });

  it("has bash permission entries", () => {
    const bash = config.permission.bash;
    expect(bash).toBeTruthy();
    expect(typeof bash).toBe("object");
    expect(Object.keys(bash!).length).toBeGreaterThan(0);
  });

  it("has path permission entries", () => {
    const path = config.permission.path;
    expect(path).toBeTruthy();
    expect(typeof path).toBe("object");
  });

  it("has external_directory permission entries", () => {
    const ed = config.permission.external_directory;
    expect(ed).toBeTruthy();
    expect(typeof ed).toBe("object");
  });

  it("denies env-related bash commands", () => {
    const bash = config.permission.bash;
    expect(bash).toBeTruthy();
    const b = bash! as Record<string, string>;
    expect(b.env).toBe("deny");
    expect(b.set).toBe("deny");
    expect(b.printenv).toBe("deny");
  });

  it("denies sensitive path patterns", () => {
    const path = config.permission.path;
    expect(path).toBeTruthy();
    const p = path! as Record<string, string>;
    expect(p["*.env"]).toBe("deny");
    expect(p["*.key"]).toBe("deny");
    expect(p["*.pem"]).toBe("deny");
    expect(p["~/.ssh/*"]).toBe("deny");
  });

  it("allows common dev commands in bash", () => {
    const bash = config.permission.bash;
    expect(bash).toBeTruthy();
    const b = bash! as Record<string, string>;
    expect(b["git status"]).toBe("allow");
    expect(b["bun run *"]).toBe("allow");
    expect(b["bun test *"]).toBe("allow");
    expect(b["node *"]).toBe("allow");
  });
});
