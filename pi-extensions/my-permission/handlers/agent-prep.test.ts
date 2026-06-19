import { describe, expect, it } from "vitest";
import { createAgentPrepHandler, type AgentPrepDependencies } from "./agent-prep.js";

function makeDeps(overrides: Partial<AgentPrepDependencies> = {}): AgentPrepDependencies {
  return {
    loadConfig: () => ({
      default: "ask",
      external: "ask",
      log: { debug: false, review: true },
      tools: {},
      bash: {},
      paths: {},
      skills: {},
      ...overrides.configOverrides ?? {},
    }),
    ...overrides,
  };
}

describe("createAgentPrepHandler", () => {
  it("returns undefined when no denied tools exist", () => {
    const handler = createAgentPrepHandler(makeDeps());
    const event = { systemPrompt: "Use these tools: read, bash" } as any;
    const result = handler(event, {} as any);
    expect(result).toBeUndefined();
  });

  it("appends deny warnings to system prompt", () => {
    const handler = createAgentPrepHandler(
      makeDeps({ configOverrides: { tools: { bash: "deny", write: "deny" } } }),
    );
    const event = { systemPrompt: "Use these tools: read, bash, write" } as any;
    const result = handler(event, {} as any);
    expect(result?.systemPrompt).toContain("[my-permission] Denied tools: bash, write");
  });

  it("does not append when no denied tools are configured", () => {
    const handler = createAgentPrepHandler(
      makeDeps({ configOverrides: { tools: { bash: "allow" } } }),
    );
    const event = { systemPrompt: "Use these tools: read, bash" } as any;
    const result = handler(event, {} as any);
    expect(result).toBeUndefined();
  });
});
