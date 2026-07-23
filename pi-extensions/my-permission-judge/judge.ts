import type {
  AuthorizeFn,
  AuthorizerLog,
  AuthorizerVerdict,
  JudgeDecision,
  JudgePrompt,
  NotifyFn,
  PromptPermissionDetails,
  ReviewFn,
  Verdict,
} from "./types";

export const AUTHORIZER_NAME = "my-judge";
const VALID_DECISIONS: JudgeDecision[] = ["allow", "defer"];

export function buildPrompt(details: PromptPermissionDetails): JudgePrompt {
  const value =
    details.command ??
    details.path ??
    details.toolName ??
    details.skillName ??
    details.value ??
    "unknown";
  const surface = details.surface ?? (details.toolName ? "tool" : "unknown");
  const agentName = details.agentName ?? "unknown";

  const system =
    '你是工具调用安全评审员。审查一次被权限系统标记为"需人工确认"的工具调用。' +
    '只输出 JSON：{"decision":"allow"|"defer","reason":"..."}。' +
    "判定标准：明显安全且符合开发常规 → allow；无法确定或有任何风险 → defer。";

  const lines = [
    `surface: ${surface}`,
    `value: ${value}`,
    `agentName: ${agentName}`,
    `message: ${details.message}`,
  ];
  if (details.toolInputPreview) {
    lines.push(`toolInputPreview: ${details.toolInputPreview}`);
  }

  const user = lines.join("\n");

  return { system, user };
}

export function parseVerdict(raw: string): Verdict | null {
  const json = extractFirstJson(raw);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;

    const decision = parsed.decision;
    // "deny" maps to "defer" — no automated blocking
    if (decision === "deny") {
      const reason =
        typeof parsed.reason === "string" ? parsed.reason : undefined;
      return { decision: "defer", reason };
    }

    if (!VALID_DECISIONS.includes(decision as JudgeDecision)) return null;

    const verdict: Verdict = { decision: decision as JudgeDecision };

    const reason = (parsed as Record<string, unknown>).reason;
    if (typeof reason === "string") {
      verdict.reason = reason;
    }

    return verdict;
  } catch {
    return null;
  }
}

function extractFirstJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();

  const inline = raw.match(/{[\s\S]*?}/);
  if (inline) return inline[0];

  return null;
}

export function createJudge(review: ReviewFn, notify?: NotifyFn): AuthorizeFn {
  return async function authorize(
    details: PromptPermissionDetails,
    _query: unknown,
    log: AuthorizerLog,
  ): Promise<AuthorizerVerdict> {
    try {
      const raw = await review(buildPrompt(details));
      const verdict = parseVerdict(raw);

      if (!verdict) {
        log.debug("my-judge:parse-failed", {
          raw,
          requestId: details.requestId,
        });
        await notifyDefer(notify, "无法解析评审结果");
        return { kind: "defer" };
      }

      log.review(AUTHORIZER_NAME, {
        requestId: details.requestId,
        surface: details.surface,
        value: details.value,
        decision: verdict.decision,
        reason: verdict.reason,
      });

      if (verdict.decision === "allow") {
        await notifyAllow(notify, verdict.reason);
        return { kind: "allow" };
      }

      // defer (including deny → defer)
      await notifyDefer(notify, verdict.reason);
      return { kind: "defer" };
    } catch (error) {
      log.debug("my-judge:error", {
        error: error instanceof Error ? error.message : String(error),
        requestId: details.requestId,
      });
      await notifyDefer(
        notify,
        error instanceof Error ? error.message : String(error),
      );
      return { kind: "defer" };
    }
  };
}

async function notifyAllow(notify?: NotifyFn, reason?: string): Promise<void> {
  const msg = reason
    ? `[${AUTHORIZER_NAME}] AI 评审已放行: ${reason}`
    : `[${AUTHORIZER_NAME}] AI 评审已放行`;
  try {
    await notify?.(msg, "info");
  } catch {
    // swallow
  }
}

async function notifyDefer(
  notify?: NotifyFn,
  reason?: string,
): Promise<void> {
  const msg = reason
    ? `[${AUTHORIZER_NAME}] AI 评审已回退人工确认: ${reason}`
    : `[${AUTHORIZER_NAME}] AI 评审已回退人工确认`;
  try {
    await notify?.(msg, "warning");
  } catch {
    // swallow
  }
}
