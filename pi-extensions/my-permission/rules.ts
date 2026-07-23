import type { Action, Config, DenyWithReason, PermissionMap, RuleValue, ToolInput, Verdict } from "./types";
import { expandHome, isExternalPath, splitBashCommandUnits, stripEnvPrefix } from "./utils";

export function decide(input: ToolInput, cwd: string, config: Config): Verdict {
  const layers: (Verdict | undefined)[] = [];

  if (input.paths.length > 0) {
    const pathRules = normalizeCrossCuttingRule(config.permission.path);
    if (pathRules) {
      layers.push(evaluatePathLayer(input.paths, pathRules, cwd));
    }

    const extRules = normalizeCrossCuttingRule(config.permission.external_directory);
    if (extRules) {
      layers.push(
        evaluateExternalDirectoryLayer(input.paths, extRules, cwd),
      );
    }
  }

  const surfaceRules = config.permission[input.toolName];
  if (surfaceRules) {
    layers.push(evaluateSurfaceLayer(input, surfaceRules, cwd));
  }

  const merged = mergeVerdicts(...layers);
  if (merged) return merged;

  return { action: config.defaultPolicy, source: "defaultPolicy" };
}

function normalizeCrossCuttingRule(
  rule: RuleValue | PermissionMap | undefined,
): PermissionMap | undefined {
  if (rule === undefined) return undefined;
  if (typeof rule === "string") return { "*": rule };
  if (typeof rule === "object" && "action" in rule) {
    const dv = rule as DenyWithReason;
    return { "*": { action: dv.action, reason: dv.reason } };
  }
  return rule;
}

export function evaluatePathLayer(
  paths: string[],
  rules: PermissionMap,
  _cwd: string,
): Verdict | undefined {
  return evaluateRuleMapMany(paths, rules, "path");
}

export function evaluateExternalDirectoryLayer(
  paths: string[],
  rules: PermissionMap,
  cwd: string,
): Verdict | undefined {
  const externalPaths = paths.filter((p) => isExternalPath(p, cwd));
  if (externalPaths.length === 0) return undefined;
  return evaluateRuleMapMany(externalPaths, rules, "external_directory");
}

export function evaluateSurfaceLayer(
  input: ToolInput,
  rules: RuleValue | PermissionMap,
  _cwd: string,
): Verdict | undefined {
  if (input.toolName === "bash" && typeof rules === "object" && !("action" in rules)) {
    const units = splitBashCommandUnits(input.value).map(stripEnvPrefix);
    const verdicts = units.map((unit) => evaluateRuleMap(unit, rules as PermissionMap, "bash"));
    return mergeVerdicts(...verdicts) ?? { action: "ask", source: "bash" };
  }
  if (typeof rules === "string") {
    return { action: rules, source: input.toolName };
  }
  if (typeof rules === "object" && "action" in rules) {
    return toVerdict(rules, input.value, input.toolName);
  }
  return evaluateRuleMap(input.value, rules as PermissionMap, input.toolName);
}

export function evaluateRuleMapMany(
  values: string[],
  rules: PermissionMap,
  source: string,
): Verdict | undefined {
  const verdicts = values.map((v) => evaluateRuleMap(v, rules, source));
  return mergeVerdicts(...verdicts);
}

export function evaluateRuleMap(
  value: string,
  rules: PermissionMap,
  source: string,
): Verdict | undefined {
  let winner: Verdict | undefined;
  for (const [pattern, rule] of Object.entries(rules)) {
    if (matchPattern(pattern, value)) {
      winner = toVerdict(rule, pattern, source);
    }
  }
  return winner;
}

export function toVerdict(
  rule: RuleValue,
  matchedPattern: string,
  source: string,
): Verdict {
  if (typeof rule === "string") {
    return { action: rule, matchedPattern, source };
  }
  return {
    action: rule.action,
    reason: rule.reason,
    matchedPattern,
    source,
  };
}

export function matchPattern(pattern: string, value: string): boolean {
  const expanded = expandHome(pattern);
  if (expanded === "*") return true;
  const regex = new RegExp(
    "^" +
      expanded.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
      "$",
  );
  return regex.test(value);
}

export function mergeVerdicts(
  ...verdicts: (Verdict | undefined)[]
): Verdict | undefined {
  const valid = verdicts.filter((v): v is Verdict => v !== undefined);
  if (valid.length === 0) return undefined;
  const order: Action[] = ["deny", "ask", "allow"];
  const sorted = [...valid].sort(
    (a, b) => order.indexOf(a.action) - order.indexOf(b.action),
  );
  return sorted[0];
}
