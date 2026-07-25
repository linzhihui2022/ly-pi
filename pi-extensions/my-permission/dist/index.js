// index.ts
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// config.ts
import { readFile } from "node:fs/promises";
var ACTIONS = ["allow", "ask", "deny"];
function createDefaultConfig() {
  return {
    defaultPolicy: "ask",
    judgeModel: "deepseek/deepseek-v4-flash",
    judgeTimeoutMs: 8000,
    childPolicy: "deny-on-unsafe",
    permission: {}
  };
}
function isAction(value) {
  return typeof value === "string" && ACTIONS.includes(value);
}
function isValidChildPolicy(value) {
  return value === "deny-on-unsafe" || value === "allow-on-safe";
}
function isValidPositiveNumber(value) {
  return typeof value === "number" && isFinite(value) && value >= 0;
}
async function loadConfig(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(`[my-permission] invalid config at ${configPath}, using defaults`);
      return createDefaultConfig();
    }
    const p = parsed;
    const def = createDefaultConfig();
    return {
      defaultPolicy: isAction(p.defaultPolicy) ? p.defaultPolicy : def.defaultPolicy,
      judgeModel: typeof p.judgeModel === "string" ? p.judgeModel : def.judgeModel,
      judgeTimeoutMs: isValidPositiveNumber(p.judgeTimeoutMs) ? p.judgeTimeoutMs : def.judgeTimeoutMs,
      childPolicy: isValidChildPolicy(p.childPolicy) ? p.childPolicy : def.childPolicy,
      permission: p.permission && typeof p.permission === "object" && !Array.isArray(p.permission) ? p.permission : def.permission
    };
  } catch (error) {
    console.warn(`[my-permission] failed to load config at ${configPath}, using defaults: ${error}`);
    return createDefaultConfig();
  }
}

// judge.ts
import { complete } from "@earendil-works/pi-ai";
function createJudge(config, deps) {
  return async function judge(input, cwd, model, resolveModel) {
    const resolved = resolveJudgeModel(config, resolveModel, model);
    if (!resolved) {
      return failureResult("未找到可用的法官模型，请手动确认", input);
    }
    const auth = deps?.getAuth ? await deps.getAuth(resolved) : undefined;
    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user", content: prompt, timestamp: Date.now() }
      ]
    };
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);
    try {
      const response = await complete(resolved, context, {
        signal: controller.signal,
        apiKey: auth?.apiKey,
        headers: auth?.headers
      });
      clearTimeout(timeout);
      return parseJudgeResponse(response) ?? failureResult("法官模型返回格式不正确，请手动确认", input);
    } catch (error) {
      clearTimeout(timeout);
      console.warn("[my-permission] judge call failed:", error);
      if (controller.signal.aborted) {
        return failureResult(`法官模型调用超时（${config.judgeTimeoutMs}ms），请手动确认`, input);
      }
      return failureResult("法官模型调用失败，请手动确认", input);
    }
  };
}
function failureResult(reason, input) {
  return {
    safe: false,
    reason,
    toolFor: `${input.toolName} ${input.value}`
  };
}
function resolveJudgeModel(config, resolveModel, fallback) {
  const parts = config.judgeModel.split("/");
  if (parts.length !== 2)
    return fallback;
  const found = resolveModel(parts[0], parts[1]);
  if (found)
    return found;
  return fallback;
}
function buildJudgePrompt(input, cwd) {
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
function parseJudgeResponse(response) {
  const text = response.content.find((c) => c.type === "text")?.text;
  if (!text)
    return;
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch)
    return;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== "object" || typeof parsed.safe !== "boolean" || typeof parsed.reason !== "string" || typeof parsed.toolFor !== "string") {
      return;
    }
    const score = parsed.score;
    if (typeof score !== "number" || score < 1 || score > 10) {
      return;
    }
    return { ...parsed, score };
  } catch {
    return;
  }
}

// utils.ts
import { homedir } from "node:os";
import { resolve } from "node:path";
function expandHome(path) {
  if (path === "~" || path.startsWith("~/")) {
    return path.replace("~", homedir());
  }
  return path;
}
function isExternalPath(path, cwd) {
  const absolute = path.startsWith("/") || path.startsWith("~") ? resolve(expandHome(path)) : resolve(cwd, path);
  const cwdAbsolute = resolve(cwd);
  return !absolute.startsWith(cwdAbsolute + "/") && absolute !== cwdAbsolute;
}
function splitBashCommandUnits(command) {
  const units = [];
  let current = "";
  let inQuotes = false;
  for (const char of command) {
    if (inQuotes) {
      current += char;
      if (char === inQuotes)
        inQuotes = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inQuotes = char;
      current += char;
      continue;
    }
    if (char === "&" || char === "|" || char === ";" || char === `
`) {
      if (current.trim())
        units.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim())
    units.push(current.trim());
  return units;
}
function stripEnvPrefix(unit) {
  const match = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+(.*)$/s.exec(unit);
  return match ? match[1] : unit;
}
function extractPathTokens(command, _cwd) {
  const tokens = new Set;
  const words = command.split(/\s+/);
  for (const word of words) {
    const trimmed = word.replace(/^["']|["']$/g, "");
    if (trimmed.startsWith("/") || trimmed.startsWith("~/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
      tokens.add(trimmed);
    } else if (trimmed.includes("/")) {
      tokens.add(trimmed);
    } else if (trimmed.startsWith(".") && trimmed.length > 1) {
      tokens.add(trimmed);
    } else if (!trimmed.startsWith("-") && /^[a-zA-Z0-9._-]+$/.test(trimmed) && trimmed.length > 1) {
      tokens.add(trimmed);
    }
  }
  return Array.from(tokens);
}

// rules.ts
function decide(input, cwd, config) {
  const layers = [];
  if (input.paths.length > 0) {
    const pathRules = normalizeCrossCuttingRule(config.permission.path);
    if (pathRules) {
      layers.push(evaluatePathLayer(input.paths, pathRules, cwd));
    }
    const extRules = normalizeCrossCuttingRule(config.permission.external_directory);
    if (extRules) {
      layers.push(evaluateExternalDirectoryLayer(input.paths, extRules, cwd));
    }
  }
  const surfaceRules = config.permission[input.toolName];
  if (surfaceRules) {
    layers.push(evaluateSurfaceLayer(input, surfaceRules, cwd));
  }
  const merged = mergeVerdicts(...layers);
  if (merged)
    return merged;
  return { action: config.defaultPolicy, source: "defaultPolicy" };
}
function normalizeCrossCuttingRule(rule) {
  if (rule === undefined)
    return;
  if (typeof rule === "string")
    return { "*": rule };
  if (typeof rule === "object" && "action" in rule) {
    const dv = rule;
    return { "*": { action: dv.action, reason: dv.reason } };
  }
  return rule;
}
function evaluatePathLayer(paths, rules, _cwd) {
  return evaluateRuleMapMany(paths, rules, "path");
}
function evaluateExternalDirectoryLayer(paths, rules, cwd) {
  const externalPaths = paths.filter((p) => isExternalPath(p, cwd));
  if (externalPaths.length === 0)
    return;
  return evaluateRuleMapMany(externalPaths, rules, "external_directory");
}
function evaluateSurfaceLayer(input, rules, _cwd) {
  if (input.toolName === "bash" && typeof rules === "object" && !("action" in rules)) {
    const units = splitBashCommandUnits(input.value).map(stripEnvPrefix);
    const verdicts = units.map((unit) => evaluateRuleMap(unit, rules, "bash"));
    return mergeVerdicts(...verdicts) ?? { action: "ask", source: "bash" };
  }
  if (typeof rules === "string") {
    return { action: rules, source: input.toolName };
  }
  if (typeof rules === "object" && "action" in rules) {
    return toVerdict(rules, input.value, input.toolName);
  }
  return evaluateRuleMap(input.value, rules, input.toolName);
}
function evaluateRuleMapMany(values, rules, source) {
  const verdicts = values.map((v) => evaluateRuleMap(v, rules, source));
  return mergeVerdicts(...verdicts);
}
function evaluateRuleMap(value, rules, source) {
  let winner;
  for (const [pattern, rule] of Object.entries(rules)) {
    if (matchPattern(pattern, value)) {
      winner = toVerdict(rule, pattern, source);
    }
  }
  return winner;
}
function toVerdict(rule, matchedPattern, source) {
  if (typeof rule === "string") {
    return { action: rule, matchedPattern, source };
  }
  return {
    action: rule.action,
    reason: rule.reason,
    matchedPattern,
    source
  };
}
function matchPattern(pattern, value) {
  const expanded = expandHome(pattern);
  if (expanded === "*")
    return true;
  const regex = new RegExp("^" + expanded.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return regex.test(value);
}
function mergeVerdicts(...verdicts) {
  const valid = verdicts.filter((v) => v !== undefined);
  if (valid.length === 0)
    return;
  const order = ["deny", "ask", "allow"];
  const sorted = [...valid].sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action));
  return sorted[0];
}

// stats.ts
var JUDGE_STATS_CUSTOM_TYPE = "my-permission-judge";
var MAX_VALUE_LENGTH = 60;
function recordJudgeStats(pi, input, result) {
  const entry = {
    decision: result.safe ? "allowed" : "denied",
    toolName: input.toolName,
    value: input.value,
    safe: result.safe,
    reason: result.reason,
    toolFor: result.toolFor
  };
  if (result.score !== undefined) {
    entry.score = result.score;
  }
  pi.appendEntry(JUDGE_STATS_CUSTOM_TYPE, entry);
}
function formatJudgeLog(entries) {
  const logs = [];
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === JUDGE_STATS_CUSTOM_TYPE && entry.data && typeof entry.data === "object") {
      const data = entry.data;
      if (typeof data.toolName === "string" && typeof data.value === "string" && typeof data.safe === "boolean" && typeof data.reason === "string" && typeof data.toolFor === "string") {
        logs.push({
          decision: data.safe ? "allowed" : "denied",
          toolName: data.toolName,
          value: truncate(data.value, MAX_VALUE_LENGTH),
          safe: data.safe,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reason,
          toolFor: data.toolFor
        });
      }
    }
  }
  if (logs.length === 0) {
    return "当前会话暂无法官判断";
  }
  const lines = [`当前会话法官判断（共 ${logs.length} 条）：`];
  for (let i = 0;i < logs.length; i++) {
    const log = logs[i];
    const label = log.safe ? "安全" : "不安全";
    const scoreText = log.score !== undefined ? `（${log.score}/10）` : "";
    lines.push(`${i + 1}. ${log.toolName}: ${log.value} → ${label}${scoreText}`);
    lines.push(`   用途：${log.toolFor}`);
    lines.push(`   理由：${log.reason}`);
  }
  return lines.join(`
`);
}
function truncate(value, maxLength) {
  if (value.length <= maxLength)
    return value;
  return `${value.slice(0, maxLength)}...`;
}

// ui.ts
var ANSI = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  cyan: "\x1B[36m"
};
function styled(text, ...codes) {
  return `${codes.join("")}${text}${ANSI.reset}`;
}
function label(text) {
  return styled(text, ANSI.bold);
}
function value(text) {
  return styled(text, ANSI.cyan);
}
function scoreStyle(score) {
  if (score <= 3)
    return ANSI.red;
  if (score <= 6)
    return ANSI.yellow;
  return ANSI.green;
}
function isChildSession() {
  return !!process.env.PI_SUBAGENT_PARENT_SESSION;
}
function createSessionCache() {
  const approved = new Set;
  return {
    approve(key) {
      approved.add(key);
    },
    isApproved(key) {
      return approved.has(key);
    }
  };
}
async function confirmToolCall(ctx, options) {
  if (!ctx.hasUI)
    return false;
  const { title, body } = formatConfirmMessage(options);
  return await ctx.ui.confirm(title, body);
}
function formatConfirmMessage(options) {
  const lines = [
    `${label("工具：")}${value(options.toolName)}`,
    `${label("操作：")}${styled(options.toolFor, ANSI.yellow)}`,
    `${label("输入：")}${value(options.value)}`,
    `${label("工作目录：")}${value(options.cwd)}`
  ];
  if (options.paths.length > 0) {
    lines.push(`${label("涉及路径：")}${value(options.paths.join(", "))}`);
  }
  const scoreText = options.score !== undefined ? styled(`（安全评分：${options.score}/10）`, scoreStyle(options.score), ANSI.bold) : "";
  lines.push(`${label("理由：")}${styled(options.reason, ANSI.bold)}${scoreText}`);
  return {
    title: `${label("确认工具调用：")}${styled(options.toolName, ANSI.bold, ANSI.cyan)}`,
    body: lines.join(`
`)
  };
}

// index.ts
async function myPermission(pi) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));
  const cache = createSessionCache();
  const child = isChildSession();
  pi.registerCommand("judge-log", {
    description: "查看当前会话的每一次法官判断",
    handler: async (_args, ctx) => {
      const text = formatJudgeLog(ctx.sessionManager.getEntries());
      ctx.ui.notify(text, "info");
    }
  });
  pi.on("tool_call", async (event, ctx) => {
    const judge = createJudge(config, {
      getAuth: typeof ctx.modelRegistry.getApiKeyAndHeaders === "function" ? async (model) => {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        return auth.ok ? auth : undefined;
      } : undefined
    });
    const toolName = event.toolName;
    const value2 = stringifyToolInput(event);
    const rawPaths = collectPaths(toolName, value2, event, ctx.cwd);
    const paths = resolveSymlinkedPaths(rawPaths, ctx.cwd);
    const verdict = decide({ toolName, value: value2, paths }, ctx.cwd, config);
    if (verdict.action === "allow")
      return;
    if (verdict.action === "deny") {
      return {
        block: true,
        reason: verdict.reason ?? `Blocked by ${verdict.source}`
      };
    }
    const cacheKey = `${toolName}:${value2}`;
    if (cache.isApproved(cacheKey))
      return;
    const resolveModel = (provider, id) => ctx.modelRegistry.find(provider, id);
    const judgeResult = await judge({ toolName, value: value2, paths }, ctx.cwd, ctx.model, resolveModel);
    recordJudgeStats(pi, { toolName, value: value2 }, judgeResult);
    if (judgeResult.safe === true)
      return;
    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult.reason
      };
    }
    const approved = await confirmToolCall(ctx, {
      toolName,
      toolFor: judgeResult.toolFor,
      reason: judgeResult.reason,
      score: judgeResult.score,
      value: value2,
      cwd: ctx.cwd,
      paths
    });
    if (approved) {
      cache.approve(cacheKey);
      return;
    }
    return { block: true, reason: `User denied: ${judgeResult.reason}` };
  });
}
function stringifyToolInput(event) {
  if (event.toolName === "bash" && typeof event.input.command === "string") {
    return event.input.command;
  }
  if ((event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") && typeof event.input.path === "string") {
    return event.input.path;
  }
  return JSON.stringify(event.input);
}
function collectPaths(toolName, value2, event, cwd) {
  if (toolName === "bash")
    return extractPathTokens(value2, cwd);
  if (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "ls") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  if (toolName === "grep" || toolName === "find") {
    return typeof event.input.path === "string" ? [event.input.path] : [];
  }
  return [];
}
function resolveSymlinkedPaths(paths, cwd) {
  const resolved = [...paths];
  for (const p of paths) {
    try {
      const full = p.startsWith("/") || p.startsWith("~") ? join(p.startsWith("~") ? process.env.HOME ?? "/home" : "/", p.replace(/^~/, "")) : join(cwd, p);
      const real = realpathSync(full);
      if (real !== full) {
        resolved.push(real);
      }
    } catch {}
  }
  return resolved;
}
export {
  myPermission as default
};
