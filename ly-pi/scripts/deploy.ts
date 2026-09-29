import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { BunFile } from "bun";

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

function removeDeprecatedFallbackModels(
  settings: Record<string, unknown>,
): void {
  const subagents = settings.subagents;
  if (!isObject(subagents)) return;

  const overrideGroups: unknown[] = [subagents.agentOverrides];
  const overridesByProvider = subagents.agentOverridesByProvider;
  if (isObject(overridesByProvider)) {
    overrideGroups.push(...Object.values(overridesByProvider));
  }

  for (const overrides of overrideGroups) {
    if (!isObject(overrides)) continue;
    for (const override of Object.values(overrides)) {
      if (isObject(override)) delete override.fallbackModels;
    }
  }
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

type FileSnapshot = { exists: true; data: Uint8Array } | { exists: false };

async function snapshotFile(path: string): Promise<FileSnapshot> {
  if (!existsSync(path)) {
    return { exists: false };
  }
  return { exists: true, data: await Bun.file(path).bytes() };
}

async function restoreFile(
  path: string,
  snapshot: FileSnapshot,
): Promise<void> {
  if (snapshot.exists) {
    await writeAtomically(path, snapshot.data);
    return;
  }
  try {
    await rm(path, { force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      throw error;
    }
  }
}

async function rollbackFiles(
  files: Array<{ path: string; snapshot: FileSnapshot }>,
): Promise<void> {
  let firstError: unknown;
  for (const file of files) {
    try {
      await restoreFile(file.path, file.snapshot);
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) {
    console.error("Deployment rollback failed:", firstError);
  }
}

const configDir = "assets/config";

// ── Extension deployment ───────────────────────────────────────────────────
{
  const extensionPath = join(agentDir, "extensions", "ly-pi", "index.js");
  const toolDisplayConfigPath = join(
    agentDir,
    "extensions",
    "ly-pi",
    "my-tool-display.json",
  );
  const retiredManifestPath = join(extensionDir, "model-policies.json");
  const files = [
    { path: extensionPath, snapshot: await snapshotFile(extensionPath) },
    {
      path: retiredManifestPath,
      snapshot: await snapshotFile(retiredManifestPath),
    },
    {
      path: toolDisplayConfigPath,
      snapshot: await snapshotFile(toolDisplayConfigPath),
    },
  ];

  const closeWorkerPath = join(
    agentDir,
    "extensions",
    "ly-pi",
    "close-worktree-worker.js",
  );
  const extensionPackagePath = join(
    agentDir,
    "extensions",
    "ly-pi",
    "package.json",
  );
  files.push(
    { path: closeWorkerPath, snapshot: await snapshotFile(closeWorkerPath) },
    {
      path: extensionPackagePath,
      snapshot: await snapshotFile(extensionPackagePath),
    },
  );

  try {
    await writeAtomically(extensionPath, Bun.file("dist/index.js"));
    await rm(retiredManifestPath, { force: true });
    await writeAtomically(
      closeWorkerPath,
      Bun.file("dist/my-worktree/close-worker-main.js"),
    );
    await writeAtomically(extensionPackagePath, '{\n  "type": "module"\n}\n');
    await writeAtomically(
      toolDisplayConfigPath,
      Bun.file(join(configDir, "my-tool-display.json")),
    );
  } catch (error) {
    await rollbackFiles(files);
    throw error;
  }

  console.log("Extension: deployed");
  console.log("Retired model manifest: removed");
  console.log("my-tool-display config: deployed");
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
  const {
    defaultModel: _defaultModel,
    defaultProvider: _defaultProvider,
    defaultThinkingLevel: _defaultThinkingLevel,
    ...managedSettings
  } = merged.settings as Record<string, unknown>;
  const { agentOverrides: _agentOverrides, ...managedSubagents } =
    merged.subagents as Record<string, unknown>;
  target = deepMerge(target, managedSettings);
  target.subagents = deepMerge(
    (target.subagents as Record<string, unknown>) ?? {},
    managedSubagents,
  );
  removeDeprecatedFallbackModels(target);
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
    {
      src: "mcp-adapter.json",
      dest: "mcp-adapter.json",
      label: "mcp-adapter.json",
    },
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
  ];

  for (const { src, dest, base, label } of configManifest) {
    await write(join(base ?? agentDir, dest), Bun.file(join(configDir, src)));
    console.log(`${label}: deployed`);
  }
}

// ── Static assets ───────────────────────────────────────────────────────────

// Sounds are user-provided under ~/.ly-pi/sound — never deployed or tracked.

// Snapshot sync for skills and agents. The manifest written by the previous
// deploy is the ownership record: only the entry names it lists are eligible
// for removal. Anything else in the target directory (external installs,
// hand-made files, symlinks) is never touched.
const MANIFEST_FILE_NAME = ".ly-pi-deploy-manifest.json";
const MANIFEST_PATH = join(agentDir, MANIFEST_FILE_NAME);
const MANIFEST_VERSION = 1;

interface AssetManifest {
  version: number;
  generatedAt: string;
  assets: { skills: string[]; agents: string[] };
}

/** Top-level entry names of a source asset directory, sorted. */
function listSourceEntries(sourceDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir).sort();
}

async function readPreviousManifest(): Promise<AssetManifest | undefined> {
  try {
    const raw = (await Bun.file(
      MANIFEST_PATH,
    ).json()) as Partial<AssetManifest>;
    if (
      raw?.version !== MANIFEST_VERSION ||
      !Array.isArray(raw.assets?.skills) ||
      !Array.isArray(raw.assets?.agents)
    ) {
      return undefined;
    }
    return raw as AssetManifest;
  } catch {
    // Missing or unparsable manifest: nothing is known to be owned.
    return undefined;
  }
}

/** Entry names must be plain basenames so a tampered manifest cannot escape. */
function isSafeEntryName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

function removeStaleAssets(
  targetDir: string,
  previousEntries: string[],
  currentEntries: string[],
): void {
  const current = new Set(currentEntries);
  const base = resolve(targetDir);

  for (const name of previousEntries) {
    if (current.has(name)) continue;
    if (!isSafeEntryName(name)) {
      console.warn(
        `Stale asset skipped (unsafe entry): ${JSON.stringify(name)}`,
      );
      continue;
    }
    const path = resolve(join(base, name));
    if (!path.startsWith(base + sep)) {
      console.warn(`Stale asset skipped (outside target): ${name}`);
      continue;
    }
    try {
      rmSync(path, { recursive: true, force: true });
      console.log(`Stale asset removed: ${name}`);
    } catch (error) {
      console.error(`Stale asset removal failed: ${name}`, error);
    }
  }
}

const skillsSource = "assets/skills";
const agentsSource = "assets/agents";
const skillsTarget = join(agentDir, "skills");
const agentsTarget = join(agentDir, "agents");
const skillsCurrent = listSourceEntries(skillsSource);
const agentsCurrent = listSourceEntries(agentsSource);
const previousManifest = await readPreviousManifest();

// Skills
if (existsSync(skillsSource)) {
  cpSync(skillsSource, skillsTarget, { recursive: true });
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
if (existsSync(agentsSource)) {
  cpSync(agentsSource, agentsTarget, { recursive: true });
  console.log("Agents: deployed");
}

// Cleanup runs after deployment, so a failed deploy can only leave extra
// entries behind, never missing ones. A missing source directory is treated as
// "ownership unknown" rather than "removed": nothing is deleted then.
if (previousManifest) {
  if (existsSync(skillsSource)) {
    removeStaleAssets(
      skillsTarget,
      previousManifest.assets.skills,
      skillsCurrent,
    );
  }
  if (existsSync(agentsSource)) {
    removeStaleAssets(
      agentsTarget,
      previousManifest.assets.agents,
      agentsCurrent,
    );
  }
}

await writeAtomically(
  MANIFEST_PATH,
  `${JSON.stringify(
    {
      version: MANIFEST_VERSION,
      generatedAt: new Date().toISOString(),
      assets: { skills: skillsCurrent, agents: agentsCurrent },
    },
    null,
    2,
  )}\n`,
);
console.log("Asset manifest: written");

// ── rtk init ────────────────────────────────────────────────────────────────
if (Bun.which("rtk")) {
  const proc = Bun.spawnSync(["rtk", "init", "-g", "--agent", "pi"]);
  if (proc.exitCode === 0) console.log("rtk init: OK");
  else console.log("rtk init: exited", proc.exitCode);
} else {
  console.log("rtk not found, skipping");
}

console.log(`\nAll deployed to ${STAGING}/`);
