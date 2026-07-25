import type { Api, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import type { Config, JudgeResult, ToolInput } from "./types";

export function createJudge(
  config: Config,
  deps?: {
    getAuth?: (
      model: Model<Api>,
    ) => Promise<{ apiKey?: string; headers?: Record<string, string> }>;
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
      return failureResult("未找到可用的法官模型，请手动确认", input);
    }

    const auth = deps?.getAuth ? await deps.getAuth(resolved) : undefined;
    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user" as const, content: prompt, timestamp: Date.now() },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);

    try {
      const response = await complete(resolved, context, {
        signal: controller.signal,
        apiKey: auth?.apiKey,
        headers: auth?.headers,
      });
      clearTimeout(timeout);
      return (
        parseJudgeResponse(response) ??
        failureResult("法官模型返回格式不正确，请手动确认", input)
      );
    } catch (error) {
      clearTimeout(timeout);
      console.warn("[my-permission] judge call failed:", error);
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

function buildJudgePrompt(input: ToolInput, cwd: string): string {
  return `你是一名编码助手的安全门禁。评估以下工具调用是否可以自动执行。

当前工作目录：${cwd}
工具名：${input.toolName}
工具输入（已脱敏）：${JSON.stringify(input.value)}

只回复严格 JSON：
{
  "safe": boolean,
  "score": number, // 1-10，分数越高越安全
  "reason": "一句话说明为什么安全或不安全",
  "toolFor": "一句话说明该工具调用会做什么"
}

判断标准：
- 安全：只读操作、git status/diff/log、运行测试、构建项目、安装项目依赖等。
- 不安全：rm -rf、sudo、chmod/chown 777、写入密钥（.env、.pem、ssh 密钥）、无明确理由访问项目外文件、通过网络发送凭证、任意代码执行等。
- 保持简洁。不要包含 markdown 格式。`;
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
