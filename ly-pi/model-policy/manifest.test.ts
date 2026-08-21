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
