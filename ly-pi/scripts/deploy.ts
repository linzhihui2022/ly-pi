import { cpSync, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BunFile } from "bun";

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
    if (
      schema.type === "object" &&
      typeof instance === "object" &&
      instance !== null
    ) {
      // required
      for (const r of (schema.required as string[] | undefined) ?? []) {
        if (!(r in instance))
          errors.push(`${path}: missing required property '${r}'`);
      }
      // properties
      const props =
        (schema.properties as
          | Record<string, Record<string, unknown>>
          | undefined) ?? {};
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
              errors.push(
                `${childPath}: expected ${props[key].type}, got ${actual}`,
              );
            }
          }
          if (props[key].enum) {
            const val = (instance as Record<string, unknown>)[key];
            if (!(props[key].enum as unknown[]).includes(val))
              errors.push(
                `${childPath}: must be one of ${JSON.stringify(props[key].enum)}`,
              );
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
          validate(
            (instance as Record<string, unknown>)[key],
            props[key],
            childPath,
          ).forEach((e) => {
            errors.push(e);
          });
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
    for (const e of errors) console.error(`  ${e}`);
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

async function write(path: string, data: string | Uint8Array | BunFile) {
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, data);
}

async function writeAtomically(
  path: string,
  data: string | Uint8Array | BunFile,
): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    await write(temporaryPath, data);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

const configDir = "assets/config";

// ── Legacy renderer cutover ─────────────────────────────────────────────────
{
  const path = join(agentDir, "extensions", "pi-tool-display", "config.json");
  await writeAtomically(
    path,
    Bun.file(join(configDir, "pi-tool-display-disabled.json")),
  );
  console.log("pi-tool-display compatibility config: deployed");
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
  } catch {
    /* first deploy */
  }
  target = deepMerge(target, merged.settings);
  target.subagents = deepMerge(
    (target.subagents as Record<string, unknown>) ?? {},
    merged.subagents,
  );
  await write(settingsPath, `${JSON.stringify(target, null, 2)}\n`);
  console.log("Settings: deployed");

  // subagentRuntime → subagent extension config.json
  await write(
    join(agentDir, "extensions", "subagent", "config.json"),
    `${JSON.stringify(merged.subagentRuntime, null, 2)}\n`,
  );
  console.log("subagentRuntime: deployed");
}

// ── Other configs ───────────────────────────────────────────────────────────
{
  const extDir = join(agentDir, "extensions", "ly-pi");

  const configManifest: Array<{
    src: string;
    dest: string;
    base?: string;
    label: string;
  }> = [
    { src: "mcp.json", dest: "mcp.json", label: "mcp.json" },
    {
      src: "append-system.md",
      dest: "APPEND_SYSTEM.md",
      label: "append-system.md",
    },
    {
      src: "web-search.json",
      dest: "web-search.json",
      base: STAGING,
      label: "web-search.json",
    },
    {
      src: "rpiv-todo.json",
      dest: "config/rpiv-todo/config.json",
      base: STAGING,
      label: "rpiv-todo",
    },
    {
      src: "my-sound.json",
      dest: "my-sound.json",
      base: extDir,
      label: "my-sound.json",
    },
    {
      src: "my-tool-display.json",
      dest: "my-tool-display.json",
      base: extDir,
      label: "my-tool-display.json",
    },
    {
      src: "my-back.json",
      dest: "my-back.json",
      base: extDir,
      label: "my-back.json",
    },
  ];

  for (const { src, dest, base, label } of configManifest) {
    await write(join(base ?? agentDir, dest), Bun.file(join(configDir, src)));
    console.log(`${label}: deployed`);
  }
}

// ── Static assets ───────────────────────────────────────────────────────────

// Sounds are user-provided under ~/.ly-pi/sound — never deployed or tracked.

// Skills
if (existsSync("assets/skills")) {
  cpSync("assets/skills", join(agentDir, "skills"), { recursive: true });
  console.log("Skills: deployed");
}

// Themes
if (existsSync("assets/themes")) {
  for (const f of new Bun.Glob("*.json").scanSync("assets/themes")) {
    await write(
      join(agentDir, "themes", f),
      Bun.file(join("assets/themes", f)),
    );
  }
  console.log("Themes: deployed");
}

// Agents
if (existsSync("assets/agents")) {
  cpSync("assets/agents", join(agentDir, "agents"), { recursive: true });
  console.log("Agents: deployed");
}

// ── rtk init ────────────────────────────────────────────────────────────────
if (Bun.which("rtk")) {
  const proc = Bun.spawnSync(["rtk", "init", "-g", "--agent", "pi"]);
  if (proc.exitCode === 0) console.log("rtk init: OK");
  else console.log("rtk init: exited", proc.exitCode);
} else {
  console.log("rtk not found, skipping");
}

console.log(`\nAll deployed to ${STAGING}/`);
