// index.ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";

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

// judge.ts
import { complete } from "@earendil-works/pi-ai";
function createJudge(config) {
  return async function judge(input, cwd, model, resolveModel) {
    const resolved = resolveJudgeModel(config, resolveModel, model);
    if (!resolved)
      return;
    const prompt = buildJudgePrompt(input, cwd);
    const context = {
      systemPrompt: "You are a security gate. Reply with strict JSON only.",
      messages: [
        { role: "user", content: prompt, timestamp: Date.now() }
      ]
    };
    try {
      const controller = new AbortController;
      const timeout = setTimeout(() => controller.abort(), config.judgeTimeoutMs);
      const response = await complete(resolved, context, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      return parseJudgeResponse(response);
    } catch (error) {
      console.warn("[my-permission] judge call failed:", error);
      return;
    }
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
    return parsed;
  } catch {
    return;
  }
}

// ui.ts
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
async function confirmToolCall(ctx, toolName, toolFor, reason) {
  if (!ctx.hasUI)
    return false;
  return await ctx.ui.confirm(`Tool call needs confirmation: ${toolName}`, `${toolFor}

Reason: ${reason}`);
}

// index.ts
async function myPermission(pi) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const config = await loadConfig(join(extensionDir, "config.json"));
  const judge = createJudge(config);
  const cache = createSessionCache();
  const child = isChildSession();
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    const value = stringifyToolInput(event);
    const rawPaths = collectPaths(toolName, value, event, ctx.cwd);
    const paths = resolveSymlinkedPaths(rawPaths, ctx.cwd);
    const verdict = decide({ toolName, value, paths }, ctx.cwd, config);
    if (verdict.action === "allow")
      return;
    if (verdict.action === "deny") {
      return { block: true, reason: verdict.reason ?? `Blocked by ${verdict.source}` };
    }
    const cacheKey = `${toolName}:${value}`;
    if (cache.isApproved(cacheKey))
      return;
    const resolveModel = (provider, id) => ctx.modelRegistry.find(provider, id);
    const judgeResult = await judge({ toolName, value, paths }, ctx.cwd, ctx.model, resolveModel);
    if (judgeResult?.safe === true)
      return;
    if (child || !ctx.hasUI) {
      return {
        block: true,
        reason: judgeResult?.reason ?? "Denied in non-interactive or subagent session"
      };
    }
    const approved = await confirmToolCall(ctx, toolName, judgeResult?.toolFor ?? `${toolName} ${value}`, judgeResult?.reason ?? "No model judgment available");
    if (approved) {
      cache.approve(cacheKey);
      return;
    }
    return { block: true, reason: judgeResult?.reason ?? "User denied" };
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
function collectPaths(toolName, value, event, cwd) {
  if (toolName === "bash")
    return extractPathTokens(value, cwd);
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
