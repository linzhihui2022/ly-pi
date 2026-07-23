import type { Model, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Config, JudgeResult, ToolInput } from "./types";

export function createJudge(runtime: ModelRuntime, config: Config) {
  return async function judge(
    input: ToolInput,
    cwd: string,
    fallbackModel: Model | undefined,
  ): Promise<JudgeResult | undefined> {
    const model = resolveModel(runtime, config, fallbackModel);
    if (!model) return undefined;

    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user" as const, content: prompt, timestamp: Date.now() },
      ],
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.judgeTimeoutMs,
      );
      const response = await runtime.complete(model, context, {
        signal: controller.signal,
      } as never);
      clearTimeout(timeout);
      return parseJudgeResponse(response);
    } catch (error) {
      console.warn("[my-permission] judge call failed:", error);
      return undefined;
    }
  };
}

function resolveModel(
  runtime: ModelRuntime,
  config: Config,
  fallback: Model | undefined,
): Model | undefined {
  const parts = config.judgeModel.split("/");
  if (parts.length !== 2) return fallback;

  const [provider, id] = parts;
  const model = runtime.getModel(provider, id);
  if (model) return model;

  const alt = (
    runtime as ModelRuntime & {
      find?: (p: string, m: string) => Model | undefined;
    }
  ).find;
  if (alt) {
    const found = alt(provider, id);
    if (found) return found;
  }

  return fallback;
}

function buildJudgePrompt(input: ToolInput, cwd: string): string {
  return `You are a security gate for a coding assistant. Evaluate whether the following tool call is safe to run automatically.

Current working directory: ${cwd}
Tool name: ${input.toolName}
Tool input (sanitized): ${JSON.stringify(input.value)}

Reply with strict JSON only:
{
  "safe": boolean,
  "reason": "one sentence explaining why it is safe or unsafe",
  "toolFor": "one sentence describing what this tool call will do"
}

Guidelines:
- Safe: read-only operations, git status/diff/log, running tests, building, installing dependencies within the project.
- Unsafe: rm -rf, sudo, chmod/chown 777, writing secrets (.env, .pem, ssh keys), accessing files outside the project without clear reason, sending credentials over network, arbitrary code execution.
- Be concise. Do not include markdown formatting.`;
}

function parseJudgeResponse(response: {
  content: Array<{ type: string; text?: string }>;
}): JudgeResult | undefined {
  const text = response.content.find((c) => c.type === "text")?.text;
  if (!text) return undefined;
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) return undefined;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { safe?: unknown }).safe !== "boolean" ||
      typeof (parsed as { reason?: unknown }).reason !== "string" ||
      typeof (parsed as { toolFor?: unknown }).toolFor !== "string"
    ) {
      return undefined;
    }
    return parsed as JudgeResult;
  } catch {
    return undefined;
  }
}
