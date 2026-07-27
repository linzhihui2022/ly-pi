import type { Api, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import { createDevLogger } from "../my-log/index";
import type { Config, JudgeResult, ToolInput } from "./types";

const log = createDevLogger("my-permission:judge");

export function createJudge(
  config: Config,
  deps?: {
    getAuth?: (
      model: Model<Api>,
    ) => Promise<
      { apiKey?: string; headers?: Record<string, string> } | undefined
    >;
    judgePrompt?: string;
    localJudge?: string;
  },
) {
  return async function judge(
    input: ToolInput,
    cwd: string,
    model: Model<Api> | undefined,
    resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  ): Promise<JudgeResult> {
    const resolved = resolveJudgeModel(config, resolveModel, model);
    if (!resolved) {
      log.warn("judge model not found", {
        configured: config.judgeModel,
        fallback: model ? `${model.provider}/${model.id}` : "none",
      });
      return failureResult("未找到可用的法官模型，请手动确认", input);
    }
    log.debug("judge model resolved", {
      provider: resolved.provider,
      model: resolved.id,
      configured: config.judgeModel,
    });

    if (!deps?.judgePrompt) {
      return failureResult("法官提示词未加载，请手动确认", input);
    }

    let auth = deps?.getAuth ? await deps.getAuth(resolved) : undefined;
    // Fallback to session model auth if judge model auth fails
    if (!auth?.apiKey && model && deps?.getAuth) {
      auth = await deps.getAuth(model);
    }
    const prompt = buildJudgePrompt(
      input,
      cwd,
      deps.judgePrompt,
      deps.localJudge,
    );
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user" as const, content: prompt, timestamp: Date.now() },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);

    try {
      const completeOpts: Record<string, unknown> = {
        signal: controller.signal,
        thinking: "off",
      };
      if (auth?.apiKey) completeOpts.apiKey = auth.apiKey;
      if (auth?.headers) completeOpts.headers = auth.headers;
      const response = await complete(resolved, context, completeOpts);
      clearTimeout(timeout);

      if (response.stopReason === "error" || response.errorMessage) {
        const detail = response.errorMessage ?? response.stopReason;
        log.error("judge API error", { detail, model: resolved.id });
        return failureResult(
          `法官模型调用失败: ${detail}`,
          input,
        );
      }

      const parsed = parseJudgeResponse(response);
      if (parsed) {
        parsed.cost = response.usage?.cost?.total;
        log.info("judge verdict", {
          safe: parsed.safe,
          score: parsed.score,
          cost: parsed.cost,
          tool: input.toolName,
        });
        return parsed;
      }
      log.warn("judge parse failed", { content: JSON.stringify(response.content) });
      return failureResult("法官模型返回格式不正确，请手动确认", input);
    } catch (error) {
      clearTimeout(timeout);
      log.error("judge call failed", { error: (error as Error).message });
      if (controller.signal.aborted) {
        return failureResult(
          `法官模型调用超时（${config.judgeTimeoutMs}ms），请手动确认`,
          input,
        );
      }
      return failureResult("法官模型调用失败，请手动确认", input);
    }
  };
}

function failureResult(reason: string, input: ToolInput): JudgeResult {
  return {
    safe: false,
    reason,
    toolFor: `${input.toolName} ${input.value}`,
  };
}

function resolveJudgeModel(
  config: Config,
  resolveModel: (provider: string, id: string) => Model<Api> | undefined,
  fallback: Model<Api> | undefined,
): Model<Api> | undefined {
  const parts = config.judgeModel.split("/");
  if (parts.length !== 2) return fallback;

  const found = resolveModel(parts[0], parts[1]);
  if (found) return found;

  return fallback;
}

function buildJudgePrompt(
  input: ToolInput,
  cwd: string,
  template: string,
  localJudge?: string,
): string {
  let prompt = template
    .replace(/\{\{cwd\}\}/g, cwd)
    .replace(/\{\{toolName\}\}/g, input.toolName)
    .replace(/\{\{toolInput\}\}/g, JSON.stringify(input.value));

  if (localJudge) {
    prompt += `\n\n项目级判断规则：\n${localJudge}`;
  }
  return prompt;
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
    const score = (parsed as { score?: unknown }).score;
    if (typeof score !== "number" || score < 1 || score > 10) {
      return undefined;
    }
    return { ...(parsed as JudgeResult), score };
  } catch {
    return undefined;
  }
}
