import { cpSync, existsSync } from "node:fs";
import { lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { BunFile } from "bun";
import {
  createModelPolicyRegistry,
  type LocalModelOverride,
  type ModelPolicyManifest,
} from "../model-policy/registry";

type CompiledModelPolicySettings = ReturnType<
  ReturnType<typeof createModelPolicyRegistry>["compilePiSettings"]
>;

let compiledModelPolicySettings: CompiledModelPolicySettings;

// ── Staging ────────────────────────────────────────────────────────────────
const STAGING = process.env.PI_STAGING_DIR ?? join(homedir(), ".pi");
const agentDir = join(STAGING, "agent");
const extensionDir = join(agentDir, "extensions", "ly-pi");

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

  const modelManifest = (await Bun.file(
    "assets/config/model-policies.json",
  ).json()) as ModelPolicyManifest;
  const localOverridePath = join(extensionDir, "models.local.json");
  const localOverride = existsSync(localOverridePath)
    ? ((await Bun.file(localOverridePath).json()) as LocalModelOverride)
    : undefined;
  compiledModelPolicySettings = createModelPolicyRegistry(
    modelManifest,
    localOverride,
  ).compilePiSettings();
  console.log("Model policy schema validation: OK");
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

type WriteData = string | Uint8Array | BunFile;

type FileSnapshot =
  | { path: string; state: "absent" }
  | { path: string; state: "file"; data: Uint8Array }
  | { path: string; state: "other" };

let temporaryWriteId = 0;

async function write(path: string, data: WriteData) {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, data);
}

async function snapshot(path: string): Promise<FileSnapshot> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) return { path, state: "other" };
    return { path, state: "file", data: new Uint8Array(await readFile(path)) };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { path, state: "absent" };
    }
    throw error;
  }
}

async function writeAtomically(path: string, data: WriteData) {
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.ly-pi-${process.pid}-${temporaryWriteId++}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await Bun.write(temporaryPath, data);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function restore(snapshot: FileSnapshot) {
  if (snapshot.state === "absent") {
    await rm(snapshot.path, { force: true });
  } else if (snapshot.state === "file") {
    await writeAtomically(snapshot.path, snapshot.data);
  }
}

async function writeTransaction(
  writes: ReadonlyArray<{ path: string; data: WriteData }>,
) {
  const snapshots = await Promise.all(writes.map(({ path }) => snapshot(path)));
  const written: FileSnapshot[] = [];

  try {
    for (const [index, write] of writes.entries()) {
      await writeAtomically(write.path, write.data);
      written.push(snapshots[index]);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const previous of written.reverse()) {
      try {
        await restore(previous);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "deployment write failed and rollback was incomplete",
      );
    }
    throw error;
  }
}

// ── Model-policy outputs ────────────────────────────────────────────────────
{
  const merged = await Bun.file("assets/config/settings.json").json();
  const settingsPath = join(agentDir, "settings.json");

  // Deep-merge settings block into target before mutating deployment output.
  let target: Record<string, unknown> = {};
  try {
    target = await Bun.file(settingsPath).json();
  } catch {
    /* first deploy */
  }
  target = deepMerge(target, merged.settings);
  target = deepMerge(target, compiledModelPolicySettings.settings);
  target.subagents = deepMerge(
    (target.subagents as Record<string, unknown>) ?? {},
    merged.subagents,
  );
  target.subagents = deepMerge(
    target.subagents as Record<string, unknown>,
    compiledModelPolicySettings.subagents,
  );

  await writeTransaction([
    { path: join(extensionDir, "index.js"), data: Bun.file("dist/index.js") },
    { path: settingsPath, data: `${JSON.stringify(target, null, 2)}\n` },
    {
      path: join(agentDir, "extensions", "subagent", "config.json"),
      data: `${JSON.stringify(merged.subagentRuntime, null, 2)}\n`,
    },
    {
      path: join(extensionDir, "model-policies.json"),
      data: Bun.file("assets/config/model-policies.json"),
    },
  ]);
  console.log("Extension: deployed");
  console.log("Settings: deployed");
  console.log("subagentRuntime: deployed");
  console.log("model-policies.json: deployed");
}

// ── Other configs ───────────────────────────────────────────────────────────
{
  const configDir = "assets/config";

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
      src: "pi-tool-display.json",
      dest: "extensions/pi-tool-display/config.json",
      label: "pi-tool-display",
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
      base: extensionDir,
      label: "my-sound.json",
    },
    {
      src: "my-back.json",
      dest: "my-back.json",
      base: extensionDir,
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
if (process.env.PI_SKIP_RTK === "1") {
  console.log("rtk init: skipped");
} else if (Bun.which("rtk")) {
  const proc = Bun.spawnSync(["rtk", "init", "-g", "--agent", "pi"]);
  if (proc.exitCode === 0) console.log("rtk init: OK");
  else console.log("rtk init: exited", proc.exitCode);
} else {
  console.log("rtk not found, skipping");
}

console.log(`\nAll deployed to ${STAGING}/`);
