import { existsSync, readdirSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
  let localOverride: LocalModelOverride | undefined;
  try {
    localOverride = (await Bun.file(
      localOverridePath,
    ).json()) as LocalModelOverride;
  } catch (error) {
    if (!isNotFoundError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `cannot load local model override '${localOverridePath}': ${message}`,
      );
    }
  }
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
  | { path: string; state: "file"; data: Uint8Array };

let temporaryWriteId = 0;

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function resolveWritePath(path: string): Promise<string> {
  let current = path;
  for (let hop = 0; hop < 40; hop++) {
    try {
      const stat = await lstat(current);
      if (!stat.isSymbolicLink()) return current;
      current = resolve(dirname(current), await readlink(current));
    } catch (error) {
      if (isNotFoundError(error)) return current;
      throw error;
    }
  }
  throw new Error(`too many symbolic links in deployment path: ${path}`);
}

async function snapshot(path: string): Promise<FileSnapshot> {
  const targetPath = await resolveWritePath(path);
  try {
    const stat = await lstat(targetPath);
    if (!stat.isFile()) {
      throw new Error(`unsupported deployment target: ${targetPath}`);
    }
    return {
      path: targetPath,
      state: "file",
      data: new Uint8Array(await readFile(targetPath)),
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { path: targetPath, state: "absent" };
    }
    throw error;
  }
}

async function writeAtomically(path: string, data: WriteData) {
  const targetPath = await resolveWritePath(path);
  const directory = dirname(targetPath);
  const temporaryPath = join(
    directory,
    `.${basename(targetPath)}.ly-pi-${process.pid}-${temporaryWriteId++}.tmp`,
  );
  await mkdir(directory, { recursive: true });

  let writeFailed = false;
  let writeError: unknown;
  try {
    await Bun.write(temporaryPath, data);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    writeFailed = true;
    writeError = error;
  }

  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    await rm(temporaryPath, { force: true });
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (writeFailed && cleanupFailed) {
    throw new AggregateError(
      [writeError, cleanupError],
      `atomic write and temporary cleanup failed: ${targetPath}`,
    );
  }
  if (writeFailed) throw writeError;
  if (cleanupFailed) throw cleanupError;
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
      written.push(snapshots[index]);
      await writeAtomically(write.path, write.data);
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

function collectFileWrites(
  sourceDir: string,
  destinationDir: string,
): Array<{ path: string; data: WriteData }> {
  const writes: Array<{ path: string; data: WriteData }> = [];

  function visit(currentDir: string, relativeDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const sourcePath = join(currentDir, entry.name);
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        visit(sourcePath, relativePath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        writes.push({
          path: join(destinationDir, relativePath),
          data: Bun.file(sourcePath),
        });
      } else {
        throw new Error(`unsupported deployment asset: ${sourcePath}`);
      }
    }
  }

  visit(sourceDir, "");
  return writes;
}

const deploymentWrites: Array<{ path: string; data: WriteData }> = [];
const deploymentMessages: string[] = [];

// ── Deployment outputs (including compiled model-policy settings) ───────────
{
  const merged = await Bun.file("assets/config/settings.json").json();
  const settingsPath = join(agentDir, "settings.json");

  // Build the complete settings target in memory before the write transaction.
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

  deploymentWrites.push(
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
  );
  deploymentMessages.push(
    "Extension: deployed",
    "Settings: deployed",
    "subagentRuntime: deployed",
    "model-policies.json: deployed",
  );
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
    deploymentWrites.push({
      path: join(base ?? agentDir, dest),
      data: Bun.file(join(configDir, src)),
    });
    deploymentMessages.push(`${label}: deployed`);
  }
}

// ── Static assets ───────────────────────────────────────────────────────────

// Sounds are user-provided under ~/.ly-pi/sound — never deployed or tracked.

// Skills
if (existsSync("assets/skills")) {
  deploymentWrites.push(
    ...collectFileWrites("assets/skills", join(agentDir, "skills")),
  );
  deploymentMessages.push("Skills: deployed");
}

// Themes
if (existsSync("assets/themes")) {
  for (const entry of readdirSync("assets/themes", { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      deploymentWrites.push({
        path: join(agentDir, "themes", entry.name),
        data: Bun.file(join("assets/themes", entry.name)),
      });
    }
  }
  deploymentMessages.push("Themes: deployed");
}

// Agents
if (existsSync("assets/agents")) {
  deploymentWrites.push(
    ...collectFileWrites("assets/agents", join(agentDir, "agents")),
  );
  deploymentMessages.push("Agents: deployed");
}

await writeTransaction(deploymentWrites);
for (const message of deploymentMessages) console.log(message);

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
