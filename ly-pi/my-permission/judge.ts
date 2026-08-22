import { homedir } from "node:os";
import { join } from "node:path";
import type { Api, ModelsApiStreamOptions } from "@earendil-works/pi-ai";
import { loadModelPolicyRegistry } from "../model-policy/config";
import { createDevLogger } from "../my-log/index";
import type { Config, JudgeResult, ModelClient, ToolInput } from "./types";

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions", "ly-pi");
const log = createDevLogger("my-permission:judge");

type JudgeModelPolicyRegistry = Pick<
  ReturnType<typeof loadModelPolicyRegistry>,
  "run"
>;

export function createJudge(
  config: Pick<Config, "judgeTimeoutMs">,
  deps: {
    modelClient: ModelClient;
    modelRunner?: JudgeModelPolicyRegistry;
    judgePrompt?: string;
    localJudge?: string;
  },
) {
  return async function judge(
    input: ToolInput,
    cwd: string,
  ): Promise<JudgeResult> {
    if (!deps.judgePrompt) {
      return failureResult("法官提示词未加载，请手动确认", input);
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
    let timedOut = false;

    try {
      const result = await (
        deps.modelRunner ?? loadModelPolicyRegistry(EXT_DIR)
      ).run("security-judge", deps.modelClient, async (model) => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          config.judgeTimeoutMs,
        );
        const completeOpts: ModelsApiStreamOptions<Api> = {
          signal: controller.signal,
        };

        try {
          return await deps.modelClient.complete(model, context, completeOpts);
        } catch (error) {
          if (controller.signal.aborted) {
            timedOut = true;
            throw Object.assign(new Error("judge model timed out"), {
              code: "ETIMEDOUT",
            });
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      });

      if (result.status !== "success") {
        log.warn("judge model unavailable", { reason: result.reason });
        if (result.failurePolicy !== "confirm") {
          return failureResult(
            `法官模型策略配置错误：security-judge 需要 confirm，实际为 ${result.failurePolicy}`,
            input,
          );
        }
        if (timedOut) {
          return failureResult(
            `法官模型调用超时（${config.judgeTimeoutMs}ms），请手动确认`,
            input,
          );
        }
        if (result.reason.startsWith("no usable candidate")) {
          return failureResult("未找到可用的法官模型，请手动确认", input);
        }
        return failureResult(`法官模型调用失败: ${result.reason}`, input);
      }

      const response = result.value;
      if (response.stopReason === "error" || response.errorMessage) {
        const detail = response.errorMessage ?? response.stopReason;
        log.error("judge API error", { detail, model: result.candidate.model });
        return failureResult(`法官模型调用失败: ${detail}`, input);
      }

      const parsed = parseJudgeResponse(response);
      if (parsed) {
        parsed.cost = response.usage?.cost?.total;
        parsed.modelUsed = result.candidate.model;
        log.info("judge verdict", {
          safe: parsed.safe,
          score: parsed.score,
          cost: parsed.cost,
          tool: input.toolName,
        });
        return parsed;
      }
      log.warn("judge parse failed", {
        content: JSON.stringify(response.content),
      });
      return failureResult("法官模型返回格式不正确，请手动确认", input);
    } catch (error) {
      log.error("judge call failed", { error: (error as Error).message });
      if (timedOut) {
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
