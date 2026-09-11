import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ImageAssetRunner,
  ImageDecoder,
  ImageGenerationJob,
} from "./batch";
import { formatImageAssetProposal } from "./contract";
import { registerImageAssetTool } from "./index";

interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  promptGuidelines?: string[];
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
}

const temporaryDirectories: string[] = [];

async function makeWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "image-asset-tool-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function setup(
  branch: unknown[],
  runner: ImageAssetRunner,
  decoder: ImageDecoder = {
    async decode() {
      return true;
    },
  },
) {
  const tools: ToolDefinition[] = [];
  const pi = {
    registerTool: vi.fn((tool: ToolDefinition) => tools.push(tool)),
  };
  registerImageAssetTool(pi as never, { runner, decoder });
  return { tool: tools[0]!, pi, branch };
}

function fakeRunner(jobs: ImageGenerationJob[]): ImageAssetRunner {
  return {
    async run(job) {
      jobs.push(job);
      await mkdir(dirname(job.stagedPath), { recursive: true });
      await writeFile(job.stagedPath, "fake png");
    },
  };
}

describe("image_asset tool", () => {
  it("registers the strict native tool and explicit-request guidelines", () => {
    const { tool, pi } = setup([], fakeRunner([]));

    expect(pi.registerTool).toHaveBeenCalledOnce();
    expect(tool).toMatchObject({
      name: "image_asset",
      label: "Image Asset",
      executionMode: "sequential",
    });
    const guidelines = tool.promptGuidelines?.join("\n") ?? "";
    expect(guidelines).toContain("explicit");
    expect(guidelines).toContain(".image-gen");
    expect(guidelines).toContain("never infer a target");
    const schema = tool.parameters as {
      additionalProperties: boolean;
      required: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["operation", "prompt", "output_paths"]);
  });

  it("runs an explicitly requested image asset and returns its record", async () => {
    const cwd = await makeWorkspace();
    const jobs: ImageGenerationJob[] = [];
    const { tool, branch } = setup(
      [
        {
          type: "message",
          message: {
            role: "user",
            content: "请生成一张狐狸图片，并保存到 assets/fox.png。",
          },
        },
      ],
      fakeRunner(jobs),
    );

    const result = await tool.execute(
      "call-1",
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      undefined,
      undefined,
      { cwd, signal: undefined, sessionManager: { getBranch: () => branch } },
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.finalPrompt).toContain(
      "Primary request: 请生成一张狐狸图片，并保存到 assets/fox.png。",
    );
    expect(jobs[0]!.finalPrompt).not.toContain("A fox reading under a lantern");
    expect(result).toMatchObject({
      details: {
        status: "published",
        operation: "generate",
        sources: { targetPath: null, referencePath: null },
        outputPaths: ["assets/fox.png"],
      },
    });
  });

  it("directly publishes a bounded automatic output without confirmation", async () => {
    const cwd = await makeWorkspace();
    const existing = join(cwd, ".image-gen/wasteland-robot.png");
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, "existing asset");
    const jobs: ImageGenerationJob[] = [];
    const { tool, branch } = setup(
      [
        {
          type: "message",
          message: { role: "user", content: "生成一张废土时代的机器人。" },
        },
      ],
      fakeRunner(jobs),
    );

    await tool.execute(
      "call-1",
      {
        operation: "generate",
        prompt: "废土时代的机器人",
        output_paths: [".image-gen/wasteland-robot.png"],
      },
      undefined,
      undefined,
      { cwd, signal: undefined, sessionManager: { getBranch: () => branch } },
    );

    expect(jobs[0]!.output.relativePath).toBe(
      ".image-gen/wasteland-robot-2.png",
    );
  });

  it("returns the authorized source record for an image edit", async () => {
    const cwd = await makeWorkspace();
    const source = join(cwd, "assets/fox-source.png");
    await mkdir(dirname(source), { recursive: true });
    await writeFile(source, "source png");
    const jobs: ImageGenerationJob[] = [];
    const { tool, branch } = setup(
      [
        {
          type: "message",
          message: {
            role: "user",
            content:
              "请编辑图片 assets/fox-source.png，并保存到 assets/fox-edited.png。",
          },
        },
      ],
      fakeRunner(jobs),
    );

    const result = await tool.execute(
      "call-1",
      {
        operation: "edit",
        prompt: "Add a blue moon brooch",
        target_path: "assets/fox-source.png",
        output_paths: ["assets/fox-edited.png"],
      },
      undefined,
      undefined,
      { cwd, signal: undefined, sessionManager: { getBranch: () => branch } },
    );

    const resolvedSource = await realpath(source);
    expect(jobs[0]!.targetPath).toBe(resolvedSource);
    expect(result).toMatchObject({
      details: { sources: { targetPath: resolvedSource, referencePath: null } },
    });
  });

  it("accepts an exact confirmation for a previously proposed request", async () => {
    const cwd = await makeWorkspace();
    const jobs: ImageGenerationJob[] = [];
    const request = {
      operation: "generate" as const,
      prompt: "A fox reading under a lantern",
      output_paths: ["assets/fox.png"],
    };
    const { tool, branch } = setup(
      [
        {
          type: "message",
          message: { role: "user", content: "请生成一张狐狸图片。" },
        },
        {
          type: "message",
          message: {
            role: "assistant",
            content: formatImageAssetProposal(request),
          },
        },
        {
          type: "message",
          message: { role: "user", content: "CONFIRM_IMAGE_ASSET" },
        },
      ],
      fakeRunner(jobs),
    );

    await tool.execute("call-1", request, undefined, undefined, {
      cwd,
      signal: undefined,
      sessionManager: { getBranch: () => branch },
    });

    expect(jobs).toHaveLength(1);
  });

  it("rejects an inferred image operation before touching the filesystem", async () => {
    const cwd = await makeWorkspace();
    const jobs: ImageGenerationJob[] = [];
    const { tool, branch } = setup(
      [
        {
          type: "message",
          message: {
            role: "user",
            content: "Please update assets/fox.png when you have time.",
          },
        },
      ],
      fakeRunner(jobs),
    );

    await expect(
      tool.execute(
        "call-1",
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          output_paths: ["assets/fox.png"],
        },
        undefined,
        undefined,
        {
          cwd,
          signal: undefined,
          sessionManager: { getBranch: () => branch },
        },
      ),
    ).rejects.toThrow("explicit user image request");

    expect(jobs).toHaveLength(0);
  });
});
