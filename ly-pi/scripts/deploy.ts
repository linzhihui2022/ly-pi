import { cpSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Staging ────────────────────────────────────────────────────────────────
const STAGING = process.env.PI_STAGING_DIR ?? join(homedir(), ".pi");
const agentDir = join(STAGING, "agent");

// ── Schema validation ──────────────────────────────────────────────────────
{
  const schema = await Bun.file("settings-schema.json").json();
  const settings = await Bun.file("assets/config/settings.json").json();

  // Minimal JSON Schema validation (draft-07 subset — type, required, enum, additionalProperties)
  function validate(
    instance: unknown,
    schema: Record<string, unknown>,
    path = "$",
  ): string[] {
    const errors: string[] = [];
    if (typeof schema !== "object" || schema === null) return errors;
    if (schema.type === "object" && typeof instance === "object" && instance !== null) {
      // required
      for (const r of (schema.required as string[] | undefined) ?? []) {
        if (!(r in instance)) errors.push(`${path}: missing required property '${r}'`);
      }
      // properties
      const props = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
      const additional = schema.additionalProperties as boolean | undefined;
      for (const key of Object.keys(instance as Record<string, unknown>)) {
        const childPath = `${path}.${key}`;
        if (key in props) {
          if (props[key].type) {
            const actual = typeof (instance as Record<string, unknown>)[key];
            if (props[key].type === "array") {
              if (!Array.isArray((instance as Record<string, unknown>)[key]))
                errors.push(`${childPath}: expected array`);
            } else if (actual !== props[key].type) {
              errors.push(`${childPath}: expected ${props[key].type}, got ${actual}`);
            }
          }
          if (props[key].enum) {
            const val = (instance as Record<string, unknown>)[key];
            if (!(props[key].enum as unknown[]).includes(val))
              errors.push(`${childPath}: must be one of ${JSON.stringify(props[key].enum)}`);
          }
          if (typeof props[key].minimum === "number") {
            const val = (instance as Record<string, unknown>)[key] as number;
            if (val < (props[key].minimum as number))
              errors.push(`${childPath}: must be >= ${props[key].minimum}`);
          }
          if (typeof props[key].maximum === "number") {
            const val = (instance as Record<string, unknown>)[key] as number;
            if (val > (props[key].maximum as number))
              errors.push(`${childPath}: must be <= ${props[key].maximum}`);
          }
          // Recurse into nested objects/arrays
          validate((instance as Record<string, unknown>)[key], props[key], childPath)
            .forEach((e) => errors.push(e));
        } else if (additional === false) {
          errors.push(`${childPath}: unknown property`);
        }
      }
    }
    return errors;
  }

  const errors = validate(settings, schema);
  if (errors.length > 0) {
    console.error("Schema validation FAILED:");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("Schema validation: OK");
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const b = result[key];
    const o = overlay[key];
    if (isObject(b) && isObject(o)) result[key] = deepMerge(b, o);
    else result[key] = o;
  }
  return result;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function write(path: string, data: string | Uint8Array) {
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, data);
}

// ── Extension bundle ────────────────────────────────────────────────────────
{
  const extDir = join(agentDir, "extensions", "ly-pi");
  await mkdir(extDir, { recursive: true });
  await write(join(extDir, "index.js"), Bun.file("dist/index.js"));
  console.log("Extension: deployed");
}

// ── Settings ────────────────────────────────────────────────────────────────
{
  const merged = await Bun.file("assets/config/settings.json").json();
  const settingsPath = join(agentDir, "settings.json");

  // Deep-merge settings block into target
  let target: Record<string, unknown> = {};
  try {
    target = await Bun.file(settingsPath).json();
  } catch { /* first deploy */ }
  target = deepMerge(target, merged.settings);
  target.subagents = deepMerge(
    (target.subagents as Record<string, unknown>) ?? {},
    merged.subagents,
  );
  await write(settingsPath, JSON.stringify(target, null, 2) + "\n");
  console.log("Settings: deployed");

  // subagentRuntime → subagent extension config.json
  await write(
    join(agentDir, "extensions", "subagent", "config.json"),
    JSON.stringify(merged.subagentRuntime, null, 2) + "\n",
  );
  console.log("subagentRuntime: deployed");
}

// ── Other configs ───────────────────────────────────────────────────────────
{
  const configDir = "assets/config";

  await write(join(agentDir, "mcp.json"), Bun.file(join(configDir, "mcp.json")));
  console.log("mcp.json: deployed");

  await write(join(agentDir, "APPEND_SYSTEM.md"), Bun.file(join(configDir, "append-system.md")));
  console.log("append-system.md: deployed");

  await write(
    join(agentDir, "extensions", "pi-tool-display", "config.json"),
    Bun.file(join(configDir, "pi-tool-display.json")),
  );
  console.log("pi-tool-display: deployed");

  await write(
    join(STAGING, "web-search.json"),
    Bun.file(join(configDir, "web-search.json")),
  );
  console.log("web-search.json: deployed");

  await write(
    join(STAGING, "config", "rpiv-todo", "config.json"),
    Bun.file(join(configDir, "rpiv-todo.json")),
  );
  console.log("rpiv-todo: deployed");

  // Extension-local configs (my-sound, my-back) → flattened at extension root
  const extDir = join(agentDir, "extensions", "ly-pi");
  await write(join(extDir, "my-sound.json"), Bun.file(join(configDir, "my-sound.json")));
  await write(join(extDir, "my-back.json"), Bun.file(join(configDir, "my-back.json")));
  console.log("Extension configs: deployed");
}

// ── Static assets ───────────────────────────────────────────────────────────
{
  // Sounds
  if (existsSync("assets/sounds")) {
    cpSync("assets/sounds", join(agentDir, "extensions", "ly-pi", "sounds"), { recursive: true });
    console.log("Sounds: deployed");
  }

  // Skills
  if (existsSync("assets/skills")) {
    cpSync("assets/skills", join(agentDir, "skills"), { recursive: true });
    console.log("Skills: deployed");
  }

  // Themes
  if (existsSync("assets/themes")) {
    for (const f of new Bun.Glob("*.json").scanSync("assets/themes")) {
      await write(join(agentDir, "themes", f), Bun.file(join("assets/themes", f)));
    }
    console.log("Themes: deployed");
  }

  // Agents
  if (existsSync("assets/agents")) {
    cpSync("assets/agents", join(agentDir, "agents"), { recursive: true });
    console.log("Agents: deployed");
  }
}

// ── rtk init ────────────────────────────────────────────────────────────────
{
  if (Bun.which("rtk")) {
    const proc = Bun.spawnSync(["rtk", "init", "-g", "--agent", "pi"]);
    if (proc.exitCode === 0) console.log("rtk init: OK");
    else console.log("rtk init: exited", proc.exitCode);
  } else {
    console.log("rtk not found, skipping");
  }
}

console.log(`\nAll deployed to ${STAGING}/`);
