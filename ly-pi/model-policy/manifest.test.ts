import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createModelPolicyRegistry,
  type ModelPolicyManifest,
} from "./registry";

const manifest = JSON.parse(
  readFileSync(
    new URL("../assets/config/model-policies.json", import.meta.url),
    "utf-8",
  ),
) as ModelPolicyManifest;

describe("checked-in model policy manifest", () => {
  it("defines every supported role and deployment binding", () => {
    const registry = createModelPolicyRegistry(manifest);

    expect(registry.compilePiSettings()).toMatchObject({
      settings: {
        defaultProvider: "openai-codex",
        defaultModel: "gpt-5.6-terra",
        defaultThinkingLevel: "max",
      },
      subagents: {
        agentOverrides: {
          scout: { model: "deepseek/deepseek-v4-flash", thinking: "off" },
          delegate: {
            model: "deepseek/deepseek-v4-flash",
            thinking: "max",
          },
        },
      },
    });
  });

  it("binds specialized agents to their capability roles", () => {
    const registry = createModelPolicyRegistry(manifest);
    const compiled = registry.compilePiSettings().subagents.agentOverrides;
    const report = registry.describe({
      find: () => ({
        provider: "test",
        id: "text-only",
        input: ["text"],
        reasoning: true,
        contextWindow: 128000,
        thinkingLevelMap: { max: "max" },
      }),
    });

    expect(manifest.deployment.agents).toMatchObject({
      "image-reader": "vision",
      "pr-comment-analyzer": "standard",
    });
    expect(compiled).toEqual(
      expect.objectContaining({
        "image-reader": expect.objectContaining({
          model: expect.any(String),
          thinking: expect.any(String),
          fallbackModels: expect.any(Array),
        }),
        "pr-comment-analyzer": expect.objectContaining({
          model: expect.any(String),
          thinking: expect.any(String),
          fallbackModels: expect.any(Array),
        }),
      }),
    );
    expect(compiled["pr-comment-analyzer"]).toEqual(compiled.delegate);
    expect(report.roles.standard.failurePolicy).toBe("error");
    expect(report.roles.vision.candidates[0]).toMatchObject({
      status: "incompatible",
      diagnostics: ["missing input: image"],
    });
  });

  it("does not allow a local override for either security role", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "security-judge-default": {
            slots: { primary: { model: "local/judge" } },
          },
        },
      }),
    ).toThrow("cannot override security policy");
  });
});
