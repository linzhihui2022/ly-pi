import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LY_PI_DIR = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED_MODEL_REFERENCE_FILES = new Set([
  "assets/config/model-policies.json",
  "model-policy/manifest.test.ts",
  "model-policy/migration.test.ts",
  "scripts/deploy.test.ts",
]);
interface Manifest {
  policies: Record<string, { candidates: Array<{ model: string }> }>;
}

const manifest = JSON.parse(
  readFileSync(
    new URL("../assets/config/model-policies.json", import.meta.url),
    "utf-8",
  ),
) as Manifest;
const manifestModelReferences = new Set(
  Object.values(manifest.policies).flatMap(({ candidates }) =>
    candidates.map(({ model }) => model),
  ),
);
const manifestModelIdentifiers = [
  ...new Set(
    [...manifestModelReferences].flatMap((model) => [
      model,
      ...model.split("/"),
    ]),
  ),
];
const MANIFEST_MODEL_IDENTIFIER = new RegExp(
  manifestModelIdentifiers
    .map((identifier) => identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
);
const MODEL_LITERAL =
  /(?:\b(?:model|modelUsed|defaultModel)\b|\b[A-Z][A-Z0-9_]*MODEL[A-Z0-9_]*\b|["'](?:model|modelUsed|defaultModel)["'])\s*[:=]\s*["']([a-z0-9][\w.-]*\/[a-z0-9][\w.-]*)["']/g;
const MODEL_FIND_LITERAL =
  /\.find\(\s*["']([a-z0-9][\w.-]*)["']\s*,\s*["']([a-z0-9][\w.-]*)["']/g;
const FALLBACK_MODELS_LITERAL = /\bfallbackModels?\b\s*[:=]\s*\[([^\]]*)\]/g;
const MODEL_REFERENCE_LITERAL = /["']([a-z0-9][\w.-]*\/[a-z0-9][\w.-]*)["']/g;
const SPLIT_DEFAULT_MODEL_LITERAL =
  /\bdefaultProvider\b\s*[:=]\s*["']([a-z0-9][\w.-]*)["'][\s\S]{0,200}?\bdefaultModel\b\s*[:=]\s*["']([a-z0-9][\w.-]*)["']/g;
const REVERSED_SPLIT_DEFAULT_MODEL_LITERAL =
  /\bdefaultModel\b\s*[:=]\s*["']([a-z0-9][\w.-]*)["'][\s\S]{0,200}?\bdefaultProvider\b\s*[:=]\s*["']([a-z0-9][\w.-]*)["']/g;
const DIRECT_PROVIDER_IMPORT =
  /["'](?:@ai-sdk\/|@earendil-works\/pi-ai\/providers(?:\/|["']))/;
function sourceFiles(root = LY_PI_DIR): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => !/^(?:node_modules|dist|coverage)\//.test(path))
    .filter((path) => /\.(?:[cm]?[jt]sx?|json)$/.test(path))
    .filter((path) => !ALLOWED_MODEL_REFERENCE_FILES.has(path));
}

function filesMatching(pattern: RegExp, root = LY_PI_DIR): string[] {
  return sourceFiles(root).filter((path) =>
    pattern.test(readFileSync(join(root, path), "utf-8")),
  );
}

function isTestFixtureModelReference(path: string, model: string): boolean {
  return path.endsWith(".test.ts") && /^(?:local|security|test)\//.test(model);
}

function unmanagedModelReferences(root = LY_PI_DIR): string[] {
  return sourceFiles(root)
    .flatMap((path) => {
      const content = readFileSync(join(root, path), "utf-8");
      const references = [
        ...[...content.matchAll(MODEL_LITERAL)].map((match) => match[1]!),
        ...[...content.matchAll(MODEL_FIND_LITERAL)].map(
          (match) => `${match[1]!}/${match[2]!}`,
        ),
        ...[...content.matchAll(FALLBACK_MODELS_LITERAL)].flatMap((match) =>
          [...match[1]!.matchAll(MODEL_REFERENCE_LITERAL)].map(
            (reference) => reference[1]!,
          ),
        ),
        ...[...content.matchAll(SPLIT_DEFAULT_MODEL_LITERAL)].map(
          (match) => `${match[1]!}/${match[2]!}`,
        ),
        ...[...content.matchAll(REVERSED_SPLIT_DEFAULT_MODEL_LITERAL)].map(
          (match) => `${match[2]!}/${match[1]!}`,
        ),
      ];
      return references
        .filter(
          (model) =>
            !manifestModelReferences.has(model) &&
            !isTestFixtureModelReference(path, model),
        )
        .map((model) => `${path}:${model}`);
    })
    .sort();
}

describe("model selection migration guard", () => {
  it("keeps repository default model identifiers in the manifest and dedicated tests", () => {
    expect(
      [...new Set(filesMatching(MANIFEST_MODEL_IDENTIFIER))].sort(),
    ).toEqual([]);
  });

  it("scans supported source extensions for Manifest candidates", () => {
    const root = mkdtempSync(join(tmpdir(), "model-policy-guard-"));
    try {
      writeFileSync(
        join(root, "candidate.mts"),
        `const model = "${manifestModelIdentifiers[0]}";`,
      );
      expect(filesMatching(MANIFEST_MODEL_IDENTIFIER, root)).toEqual([
        "candidate.mts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects provider/model literals that are absent from the Manifest", () => {
    expect(unmanagedModelReferences()).toEqual([]);

    const root = mkdtempSync(join(tmpdir(), "model-policy-guard-"));
    try {
      writeFileSync(
        join(root, "candidate.mts"),
        [
          'const DEFAULT_MODEL = "unlisted/provider";',
          'registry.find("another", "model");',
          'const fallbackModels = ["fallback/model"];',
          'const defaultProvider = "split"; const defaultModel = "model";',
        ].join(" "),
      );
      writeFileSync(
        join(root, "reverse.mts"),
        'const defaultModel = "reverse"; const defaultProvider = "order";',
      );
      expect(unmanagedModelReferences(root)).toEqual([
        "candidate.mts:another/model",
        "candidate.mts:fallback/model",
        "candidate.mts:split/model",
        "candidate.mts:unlisted/provider",
        "reverse.mts:order/reverse",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not exempt reserved-looking model references in production source", () => {
    const root = mkdtempSync(join(tmpdir(), "model-policy-guard-"));
    try {
      writeFileSync(
        join(root, "candidate.ts"),
        'const model = "security/hardcoded";',
      );
      expect(unmanagedModelReferences(root)).toEqual([
        "candidate.ts:security/hardcoded",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("has no direct provider imports in extension source", () => {
    expect(filesMatching(DIRECT_PROVIDER_IMPORT)).toEqual([]);
  });

  it.each([
    [
      "Pi AI",
      'import { deepseekProvider } from "@earendil-works/pi-ai/providers";',
    ],
    ["AI SDK", 'import { createOpenAI } from "@ai-sdk/openai";'],
  ] as const)("detects direct %s provider imports", (_kind, source) => {
    const root = mkdtempSync(join(tmpdir(), "model-policy-guard-"));
    try {
      writeFileSync(join(root, "provider.ts"), source);
      expect(filesMatching(DIRECT_PROVIDER_IMPORT, root)).toEqual([
        "provider.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves managed agent model selection to compiled settings", () => {
    const agentFiles = readdirSync(`${LY_PI_DIR}/assets/agents`).filter(
      (path) => path.endsWith(".md"),
    );

    for (const path of agentFiles) {
      const frontmatter = readFileSync(
        `${LY_PI_DIR}/assets/agents/${path}`,
        "utf-8",
      ).split("---")[1];
      expect(frontmatter).not.toMatch(/^\s*(?:model|thinking):/m);
    }
  });
});
