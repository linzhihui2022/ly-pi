import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadModelPolicyRegistry } from "./config";

const manifest = {
  version: 1,
  policies: {
    "fast-policy": {
      candidates: [
        {
          slot: "primary",
          model: "test/fast",
          label: "Fast test model",
          thinking: "off",
        },
      ],
      capabilities: { input: ["text"], minContextWindow: 128000 },
      failurePolicy: "skip",
      security: false,
    },
    "vision-policy": {
      candidates: [
        {
          slot: "primary",
          model: "test/vision",
          label: "Vision test model",
          thinking: "off",
        },
      ],
      capabilities: {
        input: ["text", "image"],
        minContextWindow: 128000,
      },
      failurePolicy: "error",
      security: false,
    },
    "security-policy": {
      candidates: [
        {
          slot: "primary",
          model: "test/security",
          label: "Security test model",
          thinking: "off",
        },
      ],
      capabilities: { input: ["text"], minContextWindow: 128000 },
      failurePolicy: "confirm",
      security: true,
    },
  },
  roles: {
    primary: "fast-policy",
    fast: "fast-policy",
    standard: "fast-policy",
    deep: "fast-policy",
    vision: "vision-policy",
    "security-judge": "security-policy",
    "security-audit": "security-policy",
  },
  deployment: {
    primary: "primary",
    agents: { scout: "fast" },
  },
};

describe("loadModelPolicyRegistry", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "model-policy-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads the manifest when the local override is absent", () => {
    writeFileSync(join(dir, "model-policies.json"), JSON.stringify(manifest));

    const registry = loadModelPolicyRegistry(dir);

    expect(
      registry.describe({
        find: () => ({
          provider: "test",
          id: "fast",
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      }).roles.fast.candidates[0].source,
    ).toBe("manifest");
  });

  it("loads an allowed local candidate override", () => {
    writeFileSync(join(dir, "model-policies.json"), JSON.stringify(manifest));
    writeFileSync(
      join(dir, "models.local.json"),
      JSON.stringify({
        version: 1,
        policies: {
          "fast-policy": {
            slots: { primary: { model: "local/fast" } },
          },
        },
      }),
    );

    const registry = loadModelPolicyRegistry(dir);

    expect(
      registry.describe({
        find: () => ({
          provider: "local",
          id: "fast",
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      }).roles.fast.candidates[0],
    ).toMatchObject({ model: "local/fast", source: "local" });
  });

  it("reports an unreadable manifest", () => {
    writeFileSync(join(dir, "model-policies.json"), "{ invalid json");

    expect(() => loadModelPolicyRegistry(dir)).toThrow(
      "cannot load model manifest",
    );
  });

  it("reports an unreadable local override", () => {
    writeFileSync(join(dir, "model-policies.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "models.local.json"), "{ invalid json");

    expect(() => loadModelPolicyRegistry(dir)).toThrow(
      "cannot load local model override",
    );
  });
});
