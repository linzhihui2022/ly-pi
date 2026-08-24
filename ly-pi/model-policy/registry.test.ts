import { describe, expect, it, vi } from "vitest";
import { createModelPolicyRegistry } from "./registry";

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
    "security-judge-policy": {
      candidates: [
        {
          slot: "primary",
          model: "test/judge",
          label: "Judge test model",
          thinking: "off",
        },
      ],
      capabilities: { input: ["text"], minContextWindow: 128000 },
      failurePolicy: "confirm",
      security: true,
    },
    "security-audit-policy": {
      candidates: [
        {
          slot: "primary",
          model: "test/audit",
          label: "Audit test model",
          thinking: "off",
        },
      ],
      capabilities: { input: ["text"], minContextWindow: 128000 },
      failurePolicy: "error-no-write",
      security: true,
    },
  },
  roles: {
    primary: "fast-policy",
    fast: "fast-policy",
    standard: "fast-policy",
    deep: "fast-policy",
    vision: "vision-policy",
    "security-judge": "security-judge-policy",
    "security-audit": "security-audit-policy",
  },
  deployment: {
    primary: "primary",
    agents: {
      scout: "fast",
      delegate: "standard",
      "image-reader": "vision",
      "pr-code-reviewer": "standard",
      "pr-comment-analyzer": "standard",
      "pr-silent-failure-hunter": "standard",
      "pr-test-analyzer": "standard",
      "pr-type-design-analyzer": "standard",
    },
  },
} as const;

const successfulResponse = { stopReason: "stop" as const };

describe("createModelPolicyRegistry", () => {
  it("describes the manifest candidate selected for a role", () => {
    const registry = createModelPolicyRegistry(manifest);

    expect(
      registry.describe({
        find: (provider, id) =>
          provider === "test" && id === "fast"
            ? {
                provider,
                id,
                input: ["text"],
                reasoning: false,
                contextWindow: 128000,
              }
            : undefined,
      }).roles.fast,
    ).toEqual({
      policy: "fast-policy",
      failurePolicy: "skip",
      candidates: [
        {
          slot: "primary",
          model: "test/fast",
          label: "Fast test model",
          thinking: "off",
          source: "manifest",
          status: "ready",
          diagnostics: [],
        },
      ],
    });
  });

  it("uses a local override for an ordinary candidate slot", () => {
    const registry = createModelPolicyRegistry(manifest, {
      version: 1,
      policies: {
        "fast-policy": {
          slots: {
            primary: {
              model: "local/fast",
              label: "Local fast model",
              thinking: "low",
            },
          },
        },
      },
    });

    expect(
      registry.describe({
        find: (provider, id) =>
          provider === "local" && id === "fast"
            ? {
                provider,
                id,
                input: ["text"],
                reasoning: true,
                contextWindow: 128000,
              }
            : undefined,
      }).roles.fast.candidates[0],
    ).toEqual({
      slot: "primary",
      model: "local/fast",
      label: "Local fast model",
      thinking: "low",
      source: "local",
      status: "ready",
      diagnostics: [],
    });
  });

  it("passes a local override model to the operation at run time", async () => {
    const registry = createModelPolicyRegistry(manifest, {
      version: 1,
      policies: {
        "fast-policy": {
          slots: { primary: { model: "local/fast" } },
        },
      },
    });
    const seenModels: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) =>
          provider === "local" && id === "fast"
            ? {
                provider,
                id,
                input: ["text"],
                reasoning: false,
                contextWindow: 128000,
              }
            : undefined,
      },
      async (model) => {
        seenModels.push(`${model.provider}/${model.id}`);
        return successfulResponse;
      },
    );

    expect(seenModels).toEqual(["local/fast"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { model: "local/fast", source: "local" },
    });
  });

  it("returns the effective Model Label for a known candidate", () => {
    const registry = createModelPolicyRegistry(manifest, {
      version: 1,
      policies: {
        "fast-policy": {
          slots: {
            primary: {
              model: "local/fast",
              label: "Local fast label",
            },
          },
        },
      },
    });

    expect(registry.getModelLabel({ provider: "local", id: "fast" })).toBe(
      "Local fast label",
    );
    expect(
      registry.getModelLabel({ provider: "unknown", id: "model" }),
    ).toBeUndefined();
  });

  it("rejects a local override for a security policy", () => {
    const securityManifest = {
      ...manifest,
      policies: {
        ...manifest.policies,
        "security-policy": {
          ...manifest.policies["fast-policy"],
          security: true,
        },
      },
      roles: { ...manifest.roles, "security-judge": "security-policy" },
    } as const;

    expect(() =>
      createModelPolicyRegistry(securityManifest, {
        version: 1,
        policies: {
          "security-policy": {
            slots: { primary: { model: "local/security" } },
          },
        },
      }),
    ).toThrow("cannot override security policy");
  });

  it("rejects an override that changes policy behavior", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "fast-policy": {
            slots: {
              primary: { failurePolicy: "error" },
            },
          },
        },
      } as never),
    ).toThrow("invalid local model override");
  });

  it("rejects an invalid model manifest before it is used", () => {
    expect(() =>
      createModelPolicyRegistry({ ...manifest, version: 2 } as never),
    ).toThrow("invalid model manifest");
  });

  it("uses immutable snapshots after validating its inputs", () => {
    const mutableManifest = structuredClone(manifest);
    const localOverride = {
      version: 1 as const,
      policies: {
        "fast-policy": {
          slots: {
            primary: {
              model: "local/fast",
              label: "Local fast model",
            },
          },
        },
      },
    };
    const registry = createModelPolicyRegistry(mutableManifest, localOverride);

    Reflect.set(
      mutableManifest.policies["security-judge-policy"].candidates[0],
      "model",
      "test/mutated-judge",
    );
    localOverride.policies["fast-policy"].slots.primary.model =
      "local/mutated-fast";

    const roles = registry.describe({ find: () => undefined }).roles;
    expect(roles["security-judge"].candidates[0]).toMatchObject({
      model: "test/judge",
    });
    expect(roles.fast.candidates[0]).toMatchObject({
      model: "local/fast",
      label: "Local fast model",
    });
  });

  it("rejects a role binding that refers to an unknown policy", () => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        roles: { ...manifest.roles, fast: "unknown-policy" },
      }),
    ).toThrow("unknown policy 'unknown-policy' for role 'fast'");
  });

  it("rejects a local override for an unknown policy", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "unknown-policy": {
            slots: { primary: { model: "local/fast" } },
          },
        },
      }),
    ).toThrow("unknown policy 'unknown-policy' in local model override");
  });

  it("requires security roles to bind security policies", () => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        roles: { ...manifest.roles, "security-judge": "fast-policy" },
      }),
    ).toThrow("security role 'security-judge' must bind a security policy");
  });

  it("requires the vision role to bind an image-capable policy", () => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        roles: { ...manifest.roles, vision: "fast-policy" },
      }),
    ).toThrow("vision role 'vision' must bind an image-capable policy");
  });

  it("requires the image-reader agent to deploy the vision role", () => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        deployment: {
          ...manifest.deployment,
          agents: {
            ...manifest.deployment.agents,
            "image-reader": "fast",
          },
        },
      }),
    ).toThrow("agent 'image-reader' must deploy the 'vision' role");
  });

  it("does not run a vision operation with a text-only candidate", async () => {
    const registry = createModelPolicyRegistry(manifest);
    const operation = vi.fn(async () => successfulResponse);

    const result = await registry.run(
      "vision",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      operation,
    );

    expect(result).toEqual({
      status: "failure",
      failurePolicy: "error",
      reason:
        "no usable candidate for role 'vision': primary (test/vision): missing input: image",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("requires every managed agent to have a deployment binding", () => {
    const { "image-reader": _imageReader, ...agents } =
      manifest.deployment.agents;

    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        deployment: { ...manifest.deployment, agents },
      } as never),
    ).toThrow("invalid model manifest");
  });

  it.each([
    ["primary", { primary: "security-judge" }],
    ["agent", { agents: { scout: "security-audit" } }],
  ] as const)("rejects a security role in deployment %s", (_kind, deployment) => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        deployment: { ...manifest.deployment, ...deployment } as never,
      }),
    ).toThrow("invalid model manifest");
  });

  it("rejects a local override for the vision policy", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "vision-policy": {
            slots: { primary: { model: "local/vision" } },
          },
        },
      }),
    ).toThrow("cannot override vision policy 'vision-policy'");
  });

  it("rejects duplicate candidate slot names", () => {
    expect(() =>
      createModelPolicyRegistry({
        ...manifest,
        policies: {
          ...manifest.policies,
          "fast-policy": {
            ...manifest.policies["fast-policy"],
            candidates: [
              ...manifest.policies["fast-policy"].candidates,
              {
                ...manifest.policies["fast-policy"].candidates[0],
                model: "test/duplicate",
              },
            ],
          },
        },
      }),
    ).toThrow("duplicate candidate slot 'primary' in policy 'fast-policy'");
  });

  it("rejects a local override for an unknown candidate slot", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "fast-policy": {
            slots: { fallback: { model: "local/fast" } },
          },
        },
      }),
    ).toThrow("unknown candidate slot 'fallback'");
  });

  it("rejects a local override with an invalid model reference", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "fast-policy": {
            slots: { primary: { model: "not-a-model" } },
          },
        },
      }),
    ).toThrow("invalid local model override");
  });

  it("rejects a local override with an empty Model Label", () => {
    expect(() =>
      createModelPolicyRegistry(manifest, {
        version: 1,
        policies: {
          "fast-policy": {
            slots: { primary: { label: "" } },
          },
        },
      }),
    ).toThrow("invalid local model override");
  });

  it.each([
    null,
    false,
  ])("rejects a non-object local override: %s", (override) => {
    expect(() =>
      createModelPolicyRegistry(manifest, override as never),
    ).toThrow("invalid local model override");
  });

  it("tries the next candidate after a retryable infrastructure failure", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          throw Object.assign(new Error("rate limited"), { status: 429 });
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toEqual({
      status: "success",
      value: successfulResponse,
      candidate: {
        slot: "fallback",
        model: "test/fallback",
        label: "Fallback test model",
        thinking: "off",
        source: "manifest",
      },
    });
  });

  it.each([
    "auth",
    "oauth",
  ] as const)("falls back after Pi reports a lowercase %s code", async (code) => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          throw Object.assign(new Error("provider authentication failed"), {
            code,
          });
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      value: successfulResponse,
      candidate: { slot: "fallback" },
    });
  });

  it("falls back when Pi reports an infrastructure error response", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          return { stopReason: "error", errorMessage: "missing API key" };
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      value: successfulResponse,
      candidate: { slot: "fallback" },
    });
  });

  it.each([
    "Provider is not configured: test/provider",
    "OAuth refresh failed for test/provider",
    "fetch failed",
    "Connection error",
    "Bad Gateway",
    "Internal Server Error",
    "provider is overloaded",
  ])("falls back after Pi reports %s", async (errorMessage) => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          return { stopReason: "error", errorMessage };
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("falls back after an aborted model response", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") return { stopReason: "aborted" };
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("falls back after an AbortError exception", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          throw Object.assign(new Error("request aborted"), {
            name: "AbortError",
          });
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it.each([
    "pending",
    "deferred",
  ] as const)("rejects an incomplete %s model response", async (stopReason) => {
    const registry = createModelPolicyRegistry(manifest);
    const attempts: string[] = [];
    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        return { stopReason };
      },
    );

    expect(attempts).toEqual(["fast"]);
    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason: `model response is not complete: ${stopReason}`,
    });
  });

  it.each([
    ["missing", {}, "model response has invalid stop reason: missing"],
    [
      "unknown",
      { stopReason: "unknown" },
      "model response has invalid stop reason: unknown",
    ],
    ["non-object", undefined, "model response is not an object"],
  ] as const)("rejects %s model responses without fallback", async (_label, response, reason) => {
    const registry = createModelPolicyRegistry(manifest);
    const attempts: string[] = [];
    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        return response as never;
      },
    );

    expect(attempts).toEqual(["fast"]);
    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason,
    });
  });

  it("falls back when Pi reports a network_error finish reason", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          return {
            stopReason: "error",
            errorMessage: "Provider finish_reason: network_error",
          };
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("falls back after Pi reports a model-not-found response", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          return {
            stopReason: "error",
            status: 404,
            errorMessage: "HTTP 404 Not Found: model not found",
          };
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("falls back after a Pi rate-limit response without status metadata", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        if (model.id === "primary") {
          return {
            stopReason: "error",
            errorMessage: "HTTP 429 Too Many Requests",
          };
        }
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["primary", "fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("does not classify arbitrary thrown messages as infrastructure failures", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        throw new Error("network format is invalid");
      },
    );

    expect(attempts).toEqual(["primary"]);
    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason: "network format is invalid",
    });
  });

  it.each([
    ["string", "unexpected operation failure", "unexpected operation failure"],
    [
      "structured error",
      { code: "E_UNEXPECTED", status: 418 },
      '{"code":"E_UNEXPECTED","status":418}',
    ],
  ] as const)("preserves a non-Error %s operation failure", async (_kind, error, reason) => {
    const registry = createModelPolicyRegistry(manifest);
    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async () => {
        throw error;
      },
    );

    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason,
    });
  });

  it("retains skipped-candidate diagnostics when every candidate is exhausted", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/missing",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) =>
          id === "fallback"
            ? {
                provider,
                id,
                input: ["text"],
                reasoning: false,
                contextWindow: 128000,
              }
            : undefined,
      },
      async () => {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      },
    );

    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason:
        "no usable candidate for role 'fast': primary (test/missing): model not found; fallback (test/fallback): rate limited",
    });
  });

  it.each([
    "malformed structured response",
    "request overloaded",
  ] as const)("does not fall back after a non-infrastructure model error response: %s", async (errorMessage) => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        return {
          stopReason: "error",
          errorMessage,
        };
      },
    );

    expect(attempts).toEqual(["primary"]);
    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason: errorMessage,
    });
  });

  it("falls back after server and network infrastructure failures", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });

    for (const error of [
      Object.assign(new Error("internal server error"), { status: 500 }),
      Object.assign(new Error("bad gateway"), { status: 502 }),
      Object.assign(new Error("internal server error"), { statusCode: 500 }),
      Object.assign(new Error("server unavailable"), { status: 503 }),
      Object.assign(new Error("network unavailable"), { code: "ETIMEDOUT" }),
    ]) {
      const attempts: string[] = [];
      const result = await registry.run(
        "fast",
        {
          find: (provider, id) => ({
            provider,
            id,
            input: ["text"],
            reasoning: false,
            contextWindow: 128000,
          }),
        },
        async (model) => {
          attempts.push(model.id);
          if (model.id === "primary") throw error;
          return successfulResponse;
        },
      );

      expect(attempts).toEqual(["primary", "fallback"]);
      expect(result).toMatchObject({
        status: "success",
        candidate: { slot: "fallback" },
      });
    }
  });

  it("does not fall back after a model protocol error", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        throw new Error("invalid response payload");
      },
    );

    expect(attempts).toEqual(["primary"]);
    expect(result).toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason: "invalid response payload",
    });
  });

  it("skips a missing candidate before using the next slot", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/missing",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) =>
          id === "fallback"
            ? {
                provider,
                id,
                input: ["text"],
                reasoning: false,
                contextWindow: 128000,
              }
            : undefined,
      },
      async (model) => {
        attempts.push(model.id);
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["fallback"]);
    expect(result).toMatchObject({
      status: "success",
      candidate: { slot: "fallback" },
    });
  });

  it("returns the role failure policy when no candidate is usable", async () => {
    const registry = createModelPolicyRegistry(manifest);

    await expect(
      registry.run(
        "fast",
        { find: () => undefined },
        async () => successfulResponse,
      ),
    ).resolves.toEqual({
      status: "failure",
      failurePolicy: "skip",
      reason:
        "no usable candidate for role 'fast': primary (test/fast): model not found",
    });
  });

  it.each([
    "error",
    "confirm",
    "error-no-write",
  ] as const)("preserves the %s role failure policy when candidates are exhausted", async (failurePolicy) => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          failurePolicy,
        },
      },
    });

    await expect(
      registry.run(
        "fast",
        { find: () => undefined },
        async () => successfulResponse,
      ),
    ).resolves.toMatchObject({ status: "failure", failurePolicy });
  });

  it("skips candidates that fail the reasoning and thinking contract", async () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              model: "test/primary",
              thinking: "high",
            },
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "high",
            },
          ],
          capabilities: {
            input: ["text"],
            minContextWindow: 128000,
            requiresReasoning: true,
          },
        },
      },
    } as never);
    const attempts: string[] = [];

    const result = await registry.run(
      "fast",
      {
        find: (provider, id) => ({
          provider,
          id,
          input: ["text"],
          reasoning: id === "fallback",
          contextWindow: 128000,
          thinkingLevelMap: id === "fallback" ? { high: "high" } : undefined,
        }),
      },
      async (model) => {
        attempts.push(model.id);
        return successfulResponse;
      },
    );

    expect(attempts).toEqual(["fallback"]);
    expect(result).toMatchObject({
      status: "success",
      value: successfulResponse,
      candidate: { slot: "fallback" },
    });
  });

  it("rejects off thinking when the registered model cannot disable it", () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          capabilities: {
            input: ["text"],
            minContextWindow: 128000,
            requiresReasoning: true,
          },
        },
      },
    } as never);

    expect(
      registry.describe({
        find: () => ({
          provider: "test",
          id: "fast",
          input: ["text"],
          reasoning: true,
          contextWindow: 128000,
          thinkingLevelMap: { off: null },
        }),
      }).roles.fast.candidates[0],
    ).toMatchObject({
      status: "incompatible",
      diagnostics: ["thinking level 'off' is unsupported"],
    });
  });

  it("accepts max thinking only when the registered model exposes it", () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              thinking: "max",
            },
          ],
          capabilities: {
            input: ["text"],
            minContextWindow: 128000,
            requiresReasoning: true,
          },
        },
      },
    } as never);

    expect(
      registry.describe({
        find: () => ({
          provider: "test",
          id: "fast",
          input: ["text"],
          reasoning: true,
          contextWindow: 128000,
          thinkingLevelMap: { max: "max" },
        }),
      }).roles.fast.candidates[0],
    ).toMatchObject({ status: "ready", diagnostics: [] });
  });

  it("compiles the primary and subagent settings from policy roles", () => {
    const registry = createModelPolicyRegistry(manifest);

    expect(registry.compilePiSettings()).toMatchObject({
      settings: {
        defaultProvider: "test",
        defaultModel: "fast",
        defaultThinkingLevel: "off",
      },
      subagents: {
        agentOverrides: {
          scout: {
            model: "test/fast",
            thinking: "off",
            fallbackModels: [],
          },
        },
      },
    });
  });

  it("compiles subagent fallback models in candidate order", () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            ...manifest.policies["fast-policy"].candidates,
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "off",
            },
          ],
        },
      },
    });

    expect(
      registry.compilePiSettings().subagents.agentOverrides.scout
        .fallbackModels,
    ).toEqual(["test/fallback"]);
  });

  it("rejects mixed candidate thinking for a deployed agent role", () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            ...manifest.policies["fast-policy"].candidates,
            {
              slot: "fallback",
              model: "test/fallback",
              label: "Fallback test model",
              thinking: "max",
            },
          ],
        },
      },
    });

    expect(() => registry.compilePiSettings()).toThrow(
      "cannot compile agent 'scout': role 'fast' has mixed candidate thinking levels",
    );
  });

  it("diagnoses when Pi's active primary differs from the initial selection", () => {
    const registry = createModelPolicyRegistry(manifest);

    expect(
      registry.describe(
        {
          find: () => ({
            provider: "test",
            id: "fast",
            input: ["text"],
            reasoning: false,
            contextWindow: 128000,
          }),
        },
        { provider: "other", id: "recovered" },
      ).primary,
    ).toEqual({
      expected: "test/fast",
      actual: "other/recovered",
      deviates: true,
    });
  });

  it("reports the unmet capability requirements for an incompatible candidate", () => {
    const registry = createModelPolicyRegistry({
      ...manifest,
      policies: {
        ...manifest.policies,
        "fast-policy": {
          ...manifest.policies["fast-policy"],
          candidates: [
            {
              ...manifest.policies["fast-policy"].candidates[0],
              thinking: "max",
            },
          ],
          capabilities: {
            input: ["text", "image"],
            minContextWindow: 200000,
            requiresReasoning: true,
          },
        },
      },
    } as never);

    expect(
      registry.describe({
        find: () => ({
          provider: "test",
          id: "fast",
          input: ["text"],
          reasoning: false,
          contextWindow: 128000,
        }),
      }).roles.fast.candidates[0],
    ).toMatchObject({
      status: "incompatible",
      diagnostics: [
        "missing input: image",
        "context window 128000 is below 200000",
        "reasoning is required",
        "thinking level 'max' is unsupported",
      ],
    });
  });
});
