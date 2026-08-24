import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";

export type ModelRole =
  | "primary"
  | "fast"
  | "standard"
  | "deep"
  | "vision"
  | "security-judge"
  | "security-audit";

export type ModelThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type RoleFailurePolicy = "skip" | "error" | "confirm" | "error-no-write";

export interface ModelCandidate {
  readonly slot: string;
  readonly model: string;
  readonly label: string;
  readonly thinking: ModelThinkingLevel;
}

export interface ModelPolicy {
  readonly candidates: readonly ModelCandidate[];
  readonly capabilities: {
    readonly input: readonly string[];
    readonly minContextWindow?: number;
    readonly requiresReasoning?: boolean;
  };
  readonly failurePolicy: RoleFailurePolicy;
  readonly security: boolean;
}

export interface ModelPolicyManifest {
  readonly version: 1;
  readonly policies: Readonly<Record<string, ModelPolicy>>;
  readonly roles: Readonly<Record<ModelRole, string>>;
  readonly deployment: {
    readonly primary: ModelRole;
    readonly agents: Readonly<Record<string, ModelRole>>;
  };
}

export interface LocalModelOverride {
  readonly version: 1;
  readonly policies: Readonly<
    Record<
      string,
      {
        readonly slots: Readonly<
          Record<
            string,
            Partial<Pick<ModelCandidate, "model" | "label" | "thinking">>
          >
        >;
      }
    >
  >;
}

const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("minimal"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("xhigh"),
  Type.Literal("max"),
]);

const ModelRoleSchema = Type.Union([
  Type.Literal("primary"),
  Type.Literal("fast"),
  Type.Literal("standard"),
  Type.Literal("deep"),
  Type.Literal("vision"),
  Type.Literal("security-judge"),
  Type.Literal("security-audit"),
]);

const RoleFailurePolicySchema = Type.Union([
  Type.Literal("skip"),
  Type.Literal("error"),
  Type.Literal("confirm"),
  Type.Literal("error-no-write"),
]);

const ModelReferenceSchema = Type.String({
  minLength: 3,
  pattern: "^[^/]+/.+",
});
const ModelLabelSchema = Type.String({ minLength: 1 });

const ModelPolicySchema = Type.Object(
  {
    candidates: Type.Array(
      Type.Object(
        {
          slot: Type.String({ minLength: 1 }),
          model: ModelReferenceSchema,
          label: ModelLabelSchema,
          thinking: ThinkingLevelSchema,
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
    capabilities: Type.Object(
      {
        input: Type.Array(
          Type.Union([Type.Literal("text"), Type.Literal("image")]),
          {
            minItems: 1,
          },
        ),
        minContextWindow: Type.Optional(Type.Integer({ minimum: 1 })),
        requiresReasoning: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false },
    ),
    failurePolicy: RoleFailurePolicySchema,
    security: Type.Boolean(),
  },
  { additionalProperties: false },
);

const ModelPolicyManifestSchema = Type.Object(
  {
    version: Type.Literal(1),
    policies: Type.Record(Type.String({ minLength: 1 }), ModelPolicySchema),
    roles: Type.Object(
      {
        primary: Type.String({ minLength: 1 }),
        fast: Type.String({ minLength: 1 }),
        standard: Type.String({ minLength: 1 }),
        deep: Type.String({ minLength: 1 }),
        vision: Type.String({ minLength: 1 }),
        "security-judge": Type.String({ minLength: 1 }),
        "security-audit": Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    deployment: Type.Object(
      {
        primary: ModelRoleSchema,
        agents: Type.Record(Type.String({ minLength: 1 }), ModelRoleSchema),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const LocalModelOverrideSchema = Type.Object(
  {
    version: Type.Literal(1),
    policies: Type.Record(
      Type.String(),
      Type.Object(
        {
          slots: Type.Record(
            Type.String(),
            Type.Partial(
              Type.Object({
                model: ModelReferenceSchema,
                label: ModelLabelSchema,
                thinking: ThinkingLevelSchema,
              }),
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

/** Minimal Pi response shape used to classify provider failures. */
export type PiModelResponse = Pick<
  AssistantMessage,
  "stopReason" | "errorMessage"
>;

export interface RegisteredModel {
  readonly provider: string;
  readonly id: string;
  readonly input: readonly string[];
  readonly reasoning: boolean;
  readonly contextWindow: number;
  readonly thinkingLevelMap?: Readonly<
    Partial<Record<ModelThinkingLevel, string | null>>
  >;
}

export interface ModelLookup<TModel extends RegisteredModel = RegisteredModel> {
  find(provider: string, id: string): TModel | undefined;
}

interface CandidateDescription {
  slot: string;
  model: string;
  label: string;
  thinking: ModelThinkingLevel;
  source: "manifest" | "local";
  status: "ready" | "missing" | "incompatible";
  diagnostics: string[];
}

interface RoleDescription {
  policy: string;
  failurePolicy: RoleFailurePolicy;
  candidates: CandidateDescription[];
}

export interface ResolvedCandidate extends ModelCandidate {
  readonly source: "manifest" | "local";
}

export type ModelRunResult<T> =
  | {
      status: "success";
      value: T;
      candidate: ResolvedCandidate;
    }
  | {
      status: "failure";
      failurePolicy: RoleFailurePolicy;
      reason: string;
    };

function splitModelRef(model: string): [string, string] {
  const slash = model.indexOf("/");
  return [model.slice(0, slash), model.slice(slash + 1)];
}

const SECURITY_ROLES = new Set<ModelRole>(["security-judge", "security-audit"]);

function assertValidModelManifest(manifest: ModelPolicyManifest): void {
  if (!Value.Check(ModelPolicyManifestSchema, manifest)) {
    throw new Error("invalid model manifest");
  }
  for (const [role, policyName] of Object.entries(manifest.roles) as Array<
    [ModelRole, string]
  >) {
    const policy = manifest.policies[policyName];
    if (!policy) {
      throw new Error(`unknown policy '${policyName}' for role '${role}'`);
    }
    if (SECURITY_ROLES.has(role) && !policy.security) {
      throw new Error(`security role '${role}' must bind a security policy`);
    }
    if (role === "vision" && !policy.capabilities.input.includes("image")) {
      throw new Error("vision role 'vision' must bind an image-capable policy");
    }

    const slots = new Set<string>();
    for (const candidate of policy.candidates) {
      if (slots.has(candidate.slot)) {
        throw new Error(
          `duplicate candidate slot '${candidate.slot}' in policy '${policyName}'`,
        );
      }
      slots.add(candidate.slot);
    }
  }

  const imageReaderRole = manifest.deployment.agents["image-reader"];
  if (imageReaderRole !== undefined && imageReaderRole !== "vision") {
    throw new Error(
      `agent 'image-reader' must deploy the 'vision' role, received '${imageReaderRole}'`,
    );
  }
}

function assertLocalOverrideAllowed(
  manifest: ModelPolicyManifest,
  localOverride: LocalModelOverride | undefined,
): void {
  if (localOverride === undefined) return;
  if (!Value.Check(LocalModelOverrideSchema, localOverride)) {
    throw new Error("invalid local model override");
  }
  for (const [policyName, override] of Object.entries(localOverride.policies)) {
    const policy = manifest.policies[policyName];
    if (!policy) {
      throw new Error(`unknown policy '${policyName}' in local model override`);
    }
    if (policy.security) {
      throw new Error(`cannot override security policy '${policyName}'`);
    }
    if (policyName === manifest.roles.vision) {
      throw new Error(`cannot override vision policy '${policyName}'`);
    }
    const slots = new Set(policy.candidates.map((candidate) => candidate.slot));
    for (const slot of Object.keys(override.slots)) {
      if (!slots.has(slot)) {
        throw new Error(
          `unknown candidate slot '${slot}' for policy '${policyName}'`,
        );
      }
    }
  }
}

function requirePolicy(
  manifest: ModelPolicyManifest,
  policyName: string,
  role: ModelRole,
): ModelPolicy {
  const policy = manifest.policies[policyName];
  if (!policy) {
    throw new Error(`unknown policy '${policyName}' for role '${role}'`);
  }
  return policy;
}

function effectiveCandidate(
  policyName: string,
  candidate: ModelCandidate,
  localOverride: LocalModelOverride | undefined,
): { candidate: ModelCandidate; source: CandidateDescription["source"] } {
  const override = localOverride?.policies[policyName]?.slots[candidate.slot];
  if (!override) return { candidate, source: "manifest" };
  return { candidate: { ...candidate, ...override }, source: "local" };
}

function supportsThinking(
  model: RegisteredModel,
  thinking: ModelThinkingLevel,
): boolean {
  if (thinking === "off") {
    return !model.reasoning || model.thinkingLevelMap?.off !== null;
  }
  if (!model.reasoning || model.thinkingLevelMap?.[thinking] === null) {
    return false;
  }
  // Pi maps unmapped standard levels through high to provider defaults.
  // Extended xhigh and max levels require an explicit model mapping.
  if (thinking === "xhigh" || thinking === "max") {
    return typeof model.thinkingLevelMap?.[thinking] === "string";
  }
  return true;
}

function diagnoseCandidate(
  candidate: ModelCandidate,
  policy: ModelPolicy,
  models: ModelLookup,
): Pick<CandidateDescription, "status" | "diagnostics"> {
  const model = models.find(...splitModelRef(candidate.model));
  if (!model) return { status: "missing", diagnostics: ["model not found"] };

  const diagnostics = policy.capabilities.input
    .filter((input) => !model.input.includes(input))
    .map((input) => `missing input: ${input}`);
  if (
    policy.capabilities.minContextWindow !== undefined &&
    model.contextWindow < policy.capabilities.minContextWindow
  ) {
    diagnostics.push(
      `context window ${model.contextWindow} is below ${policy.capabilities.minContextWindow}`,
    );
  }
  if (policy.capabilities.requiresReasoning && !model.reasoning) {
    diagnostics.push("reasoning is required");
  }
  if (!supportsThinking(model, candidate.thinking)) {
    diagnostics.push(`thinking level '${candidate.thinking}' is unsupported`);
  }

  return {
    status: diagnostics.length === 0 ? "ready" : "incompatible",
    diagnostics,
  };
}

// Only Pi response-shaped errors may use message matching for fallback. This
// prevents arbitrary operation errors from being misclassified and retried.
const modelResponseErrors = new WeakSet<Error>();
const PI_TERMINAL_STOP_REASONS = new Set([
  "stop",
  "length",
  "toolUse",
  "deferred",
]);

function modelResponseFailure(value: unknown): Error | undefined {
  if (!value || typeof value !== "object") {
    return new Error("model response is not an object");
  }
  const response = value as {
    code?: unknown;
    errorMessage?: unknown;
    status?: unknown;
    statusCode?: unknown;
    stopReason?: unknown;
  };
  if (response.stopReason === "aborted") {
    const error = Object.assign(
      new Error(
        typeof response.errorMessage === "string"
          ? response.errorMessage
          : "model request aborted",
      ),
      {
        code: "ETIMEDOUT",
        status: response.status,
        statusCode: response.statusCode,
      },
    );
    modelResponseErrors.add(error);
    return error;
  }
  if (response.stopReason === "error") {
    const error = Object.assign(
      new Error(
        typeof response.errorMessage === "string"
          ? response.errorMessage
          : "model reported an error",
      ),
      {
        code: response.code,
        status: response.status,
        statusCode: response.statusCode,
      },
    );
    modelResponseErrors.add(error);
    return error;
  }
  if (response.stopReason === "pending" || response.stopReason === "deferred") {
    return new Error(
      typeof response.errorMessage === "string"
        ? response.errorMessage
        : `model response is not complete: ${response.stopReason}`,
    );
  }
  if (
    typeof response.stopReason !== "string" ||
    !PI_TERMINAL_STOP_REASONS.has(response.stopReason)
  ) {
    return new Error(
      `model response has invalid stop reason: ${String(response.stopReason ?? "missing")}`,
    );
  }
  if (typeof response.errorMessage === "string") {
    return new Error(
      `model response has an error message for stop reason '${response.stopReason}'`,
    );
  }
  return undefined;
}

function isRetryableInfrastructureFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status =
    typeof details.status === "number"
      ? details.status
      : typeof details.statusCode === "number"
        ? details.statusCode
        : undefined;
  if (status === 401 || status === 403 || status === 408 || status === 429) {
    return true;
  }
  if (status !== undefined && status >= 500 && status <= 599) return true;

  const code =
    typeof details.code === "string" ? details.code.toUpperCase() : "";
  if (
    [
      "AUTH",
      "OAUTH",
      "ECONNABORTED",
      "ECONNREFUSED",
      "ECONNRESET",
      "EAI_AGAIN",
      "ENETDOWN",
      "ENETUNREACH",
      "ENOTFOUND",
      "ETIMEDOUT",
    ].includes(code)
  ) {
    return true;
  }

  if (details.name === "AbortError") return true;
  if (!modelResponseErrors.has(error as Error)) return false;

  const message =
    typeof details.message === "string" ? details.message.toLowerCase() : "";
  return /\b(?:401|403|408|429|5\d\d)\b|api key|authentication|auth failed|forbidden|provider (?:is )?not configured|oauth (?:refresh|auth derivation) (?:failed|returned)|rate limit|too many requests|request (?:was )?aborted|timed? out|timeout|fetch failed|connection (?:error|failed|failure)|bad gateway|internal server error|network[_ ](?:error|unavailable|failure)|service unavailable|(?:provider|server|service) (?:is )?overload(?:ed)?/.test(
    message,
  );
}

export function createModelPolicyRegistry(
  manifest: ModelPolicyManifest,
  localOverride?: LocalModelOverride,
) {
  assertValidModelManifest(manifest);
  assertLocalOverrideAllowed(manifest, localOverride);
  manifest = structuredClone(manifest);
  localOverride = localOverride && structuredClone(localOverride);

  return {
    getModelLabel(
      model: Pick<RegisteredModel, "provider" | "id"> | undefined,
    ): string | undefined {
      if (!model) return undefined;

      const modelRef = `${model.provider}/${model.id}`;
      const seenPolicies = new Set<string>();
      for (const policyName of Object.values(manifest.roles)) {
        if (seenPolicies.has(policyName)) continue;
        seenPolicies.add(policyName);
        const policy = manifest.policies[policyName];
        if (!policy) continue;

        for (const candidate of policy.candidates) {
          const effective = effectiveCandidate(
            policyName,
            candidate,
            localOverride,
          ).candidate;
          if (effective.model === modelRef) return effective.label;
        }
      }
      return undefined;
    },

    describe(
      models: ModelLookup,
      actualPrimary?: Pick<RegisteredModel, "provider" | "id">,
    ): {
      roles: Record<ModelRole, RoleDescription>;
      primary: { expected: string; actual?: string; deviates: boolean };
    } {
      const roles = {} as Record<ModelRole, RoleDescription>;
      for (const [role, policyName] of Object.entries(manifest.roles) as Array<
        [ModelRole, string]
      >) {
        const policy = requirePolicy(manifest, policyName, role);
        roles[role] = {
          policy: policyName,
          failurePolicy: policy.failurePolicy,
          candidates: policy.candidates.map((candidate) => {
            const effective = effectiveCandidate(
              policyName,
              candidate,
              localOverride,
            );
            const diagnosis = diagnoseCandidate(
              effective.candidate,
              policy,
              models,
            );
            return {
              slot: effective.candidate.slot,
              model: effective.candidate.model,
              label: effective.candidate.label,
              thinking: effective.candidate.thinking,
              source: effective.source,
              ...diagnosis,
            };
          }),
        };
      }
      const primaryPolicyName = manifest.roles[manifest.deployment.primary];
      const primaryPolicy = requirePolicy(
        manifest,
        primaryPolicyName,
        manifest.deployment.primary,
      );
      const primaryCandidate = effectiveCandidate(
        primaryPolicyName,
        primaryPolicy.candidates[0],
        localOverride,
      ).candidate;
      const expected = primaryCandidate.model;
      const actual = actualPrimary
        ? `${actualPrimary.provider}/${actualPrimary.id}`
        : undefined;

      return {
        roles,
        primary: {
          expected,
          actual,
          deviates: actual !== undefined && actual !== expected,
        },
      };
    },

    compilePiSettings() {
      const candidatesForRole = (role: ModelRole): ResolvedCandidate[] => {
        const policyName = manifest.roles[role];
        const policy = requirePolicy(manifest, policyName, role);
        return policy.candidates.map((candidate) => {
          const effective = effectiveCandidate(
            policyName,
            candidate,
            localOverride,
          );
          return { ...effective.candidate, source: effective.source };
        });
      };
      const [primary] = candidatesForRole(manifest.deployment.primary);
      const primaryRef = splitModelRef(primary.model);

      return {
        settings: {
          defaultProvider: primaryRef[0],
          defaultModel: primaryRef[1],
          defaultThinkingLevel: primary.thinking,
        },
        subagents: {
          agentOverrides: Object.fromEntries(
            Object.entries(manifest.deployment.agents).map(([agent, role]) => {
              const [candidate, ...fallbacks] = candidatesForRole(role);
              if (
                fallbacks.some(
                  (fallback) => fallback.thinking !== candidate.thinking,
                )
              ) {
                throw new Error(
                  `cannot compile agent '${agent}': role '${role}' has mixed candidate thinking levels`,
                );
              }
              return [
                agent,
                {
                  model: candidate.model,
                  thinking: candidate.thinking,
                  fallbackModels: fallbacks.map((fallback) => fallback.model),
                },
              ];
            }),
          ),
        },
      };
    },

    async run<TModel extends RegisteredModel, TResult extends PiModelResponse>(
      role: ModelRole,
      models: ModelLookup<TModel>,
      operation: (
        model: TModel,
        candidate: ResolvedCandidate,
      ) => Promise<TResult>,
    ): Promise<ModelRunResult<TResult>> {
      const policyName = manifest.roles[role];
      const policy = requirePolicy(manifest, policyName, role);

      const skippedCandidates: string[] = [];
      for (const candidate of policy.candidates) {
        const effective = effectiveCandidate(
          policyName,
          candidate,
          localOverride,
        );
        const diagnosis = diagnoseCandidate(
          effective.candidate,
          policy,
          models,
        );
        const model = models.find(...splitModelRef(effective.candidate.model));
        if (!model || diagnosis.status !== "ready") {
          skippedCandidates.push(
            `${effective.candidate.slot} (${effective.candidate.model}): ${diagnosis.diagnostics.join(", ")}`,
          );
          continue;
        }

        const resolvedCandidate: ResolvedCandidate = {
          ...effective.candidate,
          source: effective.source,
        };
        try {
          const value = await operation(model, resolvedCandidate);
          const responseError = modelResponseFailure(value);
          if (responseError) {
            if (isRetryableInfrastructureFailure(responseError)) {
              skippedCandidates.push(
                `${resolvedCandidate.slot} (${resolvedCandidate.model}): ${responseError.message}`,
              );
              continue;
            }
            return {
              status: "failure",
              failurePolicy: policy.failurePolicy,
              reason: responseError.message,
            };
          }
          return {
            status: "success",
            value,
            candidate: resolvedCandidate,
          };
        } catch (error) {
          if (isRetryableInfrastructureFailure(error)) {
            skippedCandidates.push(
              `${resolvedCandidate.slot} (${resolvedCandidate.model}): ${error instanceof Error ? error.message : "model operation failed"}`,
            );
            continue;
          }
          return {
            status: "failure",
            failurePolicy: policy.failurePolicy,
            reason:
              error instanceof Error ? error.message : "model operation failed",
          };
        }
      }

      return {
        status: "failure",
        failurePolicy: policy.failurePolicy,
        reason: `no usable candidate for role '${role}': ${skippedCandidates.join("; ")}`,
      };
    },
  };
}
