import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ImageAssetBatchError, type ImageGenerationJob } from "./batch";
import {
  buildCodexImageCommand,
  type CodexImageArtifactDirectoryLister,
  type CodexImageArtifactReader,
  type CodexProcessExecutor,
  createCodexImageRunner,
  createSipsImageDecoder,
  localCodexProcessExecutor,
} from "./codex";

const completedImageGenerationEvent = JSON.stringify({
  type: "item.completed",
  item: {
    type: "image_generation",
    status: "completed",
    saved_path: "/generated/image.png",
  },
});

const matchingArtifactReader: CodexImageArtifactReader = {
  async read() {
    return Buffer.from("generated artifact");
  },
};

const editJob: ImageGenerationJob = {
  cwd: "/workspace",
  finalPrompt: "Primary request: Add a blue moon brooch",
  output: {
    absolutePath: "/workspace/assets/fox-edited.png",
    relativePath: "assets/fox-edited.png",
  },
  stagedPath: "/workspace/.image-asset-stage-a/0.png",
  targetPath: "/outside/target.png",
  referencePath: "/outside/reference.png",
};

const GENERATED_IMAGES_DIRECTORY = "/codex-home/generated_images";
const REAL_THREAD_ID = "01a093db-6e05-7c31-97ff-eaa1ed0431cc";
const REAL_THREAD_DIRECTORY = join(GENERATED_IMAGES_DIRECTORY, REAL_THREAD_ID);
const REAL_GENERATED_ARTIFACT = join(
  REAL_THREAD_DIRECTORY,
  "exec-8020e4d9-a712-4eff-a9a6-4616d14406e2.png",
);

function realCodexEventStream(threadId: string): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: threadId }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", id: "msg-1", text: "Copied the PNG." },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        id: "cmd-1",
        command: "/bin/zsh -lc 'cp artifact.png staged.png'",
        aggregated_output: "",
        exit_code: 0,
        status: "completed",
      },
    }),
    JSON.stringify({ type: "turn.completed" }),
  ].join("\n");
}

function filesArtifactReader(
  files: Readonly<Record<string, string>>,
): CodexImageArtifactReader {
  return {
    async read(path) {
      const content = files[path];
      if (content === undefined) throw new Error("artifact unavailable");
      return Buffer.from(content);
    },
  };
}

function fakeDirectoryLister(
  entries: Readonly<Record<string, readonly string[]>>,
): CodexImageArtifactDirectoryLister {
  return {
    async list(path) {
      const names = entries[path];
      if (!names) throw new Error("directory unavailable");
      return names;
    },
  };
}

describe("buildCodexImageCommand", () => {
  it("uses Codex built-in image generation with target then reference attachments", () => {
    const command = buildCodexImageCommand(editJob);

    expect(command.command).toBe("codex");
    expect(command.args.slice(0, -1)).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--cd",
      "/workspace",
      "--sandbox",
      "workspace-write",
      "--image",
      "/outside/target.png",
      "--image",
      "/outside/reference.png",
      "--json",
      "--output-last-message",
      "/workspace/.image-asset-stage-a/0.last.md",
    ]);
    const instruction = command.args.at(-1)!;
    expect(instruction).toContain("$imagegen");
    expect(instruction).toContain("Primary request: Add a blue moon brooch");
    expect(instruction).toContain("Image target: target.png");
    expect(instruction).toContain("Reference image: reference.png");
    expect(instruction).toContain(".image-asset-stage-a/0.png");
    expect(instruction).not.toContain("/outside/target.png");
    expect(instruction).not.toContain("/outside/reference.png");
  });

  it("omits image attachments for generation", () => {
    const command = buildCodexImageCommand({
      ...editJob,
      targetPath: undefined,
      referencePath: undefined,
    });

    expect(command.args).not.toContain("--image");
    expect(command.args.at(-1)).toContain("Input images: none");
  });

  it("attaches only the target when no reference is supplied", () => {
    const command = buildCodexImageCommand({
      ...editJob,
      referencePath: undefined,
    });

    expect(
      command.args.filter((argument) => argument === "--image"),
    ).toHaveLength(1);
    expect(command.args.at(-1)).not.toContain("Reference image:");
  });

  it("rejects a staging path outside the Codex workspace", () => {
    try {
      buildCodexImageCommand({
        ...editJob,
        stagedPath: "/outside/0.png",
      });
      throw new Error(
        "expected buildCodexImageCommand to reject the staging path",
      );
    } catch (error) {
      expect(error).toMatchObject({ code: "generation_failed" });
    }
  });
});

describe("createCodexImageRunner", () => {
  it("passes a successful Codex command with image generation evidence", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const executor: CodexProcessExecutor = {
      async execute(command, args) {
        calls.push({ command, args });
        return {
          exitCode: 0,
          stdout: completedImageGenerationEvent,
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(executor, matchingArtifactReader).run(editJob),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe("codex");
    expect(calls[0]!.args).toContain("--image");
  });

  it("rejects a successful command without built-in image generation evidence", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: { type: "command_execution", status: "completed" },
          }),
          stderr: "",
        };
      },
    };

    await expect(createCodexImageRunner(executor).run(editJob)).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Built-in image generation could not be verified.",
      ),
    );
  });

  it("accepts a completed image_gen tool-call event", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: {
              type: "tool_call",
              name: "image_gen",
              status: "completed",
              saved_path: "/generated/image.png",
            },
          }),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(executor, matchingArtifactReader).run(editJob),
    ).resolves.toBeUndefined();
  });

  it("rejects an artifact path that is not absolute or is the staging path", async () => {
    const relativeArtifactExecutor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: {
              type: "image_generation",
              status: "completed",
              saved_path: "generated/image.png",
            },
          }),
          stderr: "",
        };
      },
    };
    const sameArtifactExecutor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: {
              type: "image_generation",
              status: "completed",
              saved_path: editJob.stagedPath,
            },
          }),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(relativeArtifactExecutor).run(editJob),
    ).rejects.toMatchObject({ code: "generation_failed" });
    await expect(
      createCodexImageRunner(sameArtifactExecutor).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Built-in image generation artifact could not be verified.",
      ),
    );
  });

  it("rejects a symlink alias that resolves to the staging file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "image-asset-codex-"));
    const stagedPath = join(directory, "staged.png");
    const artifactPath = join(directory, "artifact.png");
    await writeFile(stagedPath, "generated artifact");
    await symlink(stagedPath, artifactPath);
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: {
              type: "image_generation",
              status: "completed",
              saved_path: artifactPath,
            },
          }),
          stderr: "",
        };
      },
    };
    let reads = 0;
    const artifactReader: CodexImageArtifactReader = {
      async read() {
        reads += 1;
        return Buffer.from("generated artifact");
      },
    };

    try {
      await expect(
        createCodexImageRunner(executor, artifactReader).run({
          ...editJob,
          stagedPath,
        }),
      ).rejects.toMatchObject({ code: "generation_failed" });
      expect(reads).toBe(0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("maps artifact read failures to a safe generation error", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: completedImageGenerationEvent,
          stderr: "",
        };
      },
    };
    const artifactReader: CodexImageArtifactReader = {
      async read() {
        throw new Error("sensitive artifact detail");
      },
    };

    await expect(
      createCodexImageRunner(executor, artifactReader).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Built-in image generation artifact could not be verified.",
      ),
    );
  });

  it("preserves cancellation during artifact verification", async () => {
    const controller = new AbortController();
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: completedImageGenerationEvent,
          stderr: "",
        };
      },
    };
    const artifactReader: CodexImageArtifactReader = {
      async read() {
        controller.abort();
        throw new Error("cancelled read");
      },
    };

    await expect(
      createCodexImageRunner(executor, artifactReader).run({
        ...editJob,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("accepts the artifact Codex copied from its generated_images directory", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream(REAL_THREAD_ID),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({
          [REAL_GENERATED_ARTIFACT]: "generated artifact",
          [editJob.stagedPath]: "generated artifact",
        }),
        {
          artifactDirectoryLister: fakeDirectoryLister({
            [REAL_THREAD_DIRECTORY]: [
              "exec-8020e4d9-a712-4eff-a9a6-4616d14406e2.png",
            ],
          }),
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run(editJob),
    ).resolves.toBeUndefined();
  });

  it("rejects a staged file that matches no artifact in the generated_images directory", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream(REAL_THREAD_ID),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({
          [REAL_GENERATED_ARTIFACT]: "generated artifact",
          [editJob.stagedPath]: "local replacement",
        }),
        {
          artifactDirectoryLister: fakeDirectoryLister({
            [REAL_THREAD_DIRECTORY]: [
              "exec-8020e4d9-a712-4eff-a9a6-4616d14406e2.png",
            ],
          }),
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Generated image does not match the verified image_gen artifact.",
      ),
    );
  });

  it("accepts the directory artifact when the reported saved_path is unusable", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: [
            JSON.stringify({
              type: "thread.started",
              thread_id: REAL_THREAD_ID,
            }),
            JSON.stringify({
              type: "item.completed",
              item: {
                type: "image_generation",
                status: "completed",
                saved_path: join(REAL_THREAD_DIRECTORY, "missing.png"),
              },
            }),
            JSON.stringify({ type: "turn.completed" }),
          ].join("\n"),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({
          [REAL_GENERATED_ARTIFACT]: "generated artifact",
          [editJob.stagedPath]: "generated artifact",
        }),
        {
          artifactDirectoryLister: fakeDirectoryLister({
            [REAL_THREAD_DIRECTORY]: [
              "exec-8020e4d9-a712-4eff-a9a6-4616d14406e2.png",
            ],
          }),
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run(editJob),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the generated_images directory cannot be inspected", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream(REAL_THREAD_ID),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({ [editJob.stagedPath]: "generated artifact" }),
        {
          artifactDirectoryLister: fakeDirectoryLister({}),
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run(editJob),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("ignores unsafe thread identifiers and non-PNG artifacts", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream("../../outside"),
          stderr: "",
        };
      },
    };
    let listings = 0;

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({ [editJob.stagedPath]: "generated artifact" }),
        {
          artifactDirectoryLister: {
            async list() {
              listings += 1;
              return ["notes.txt", "image.jpeg"];
            },
          },
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run(editJob),
    ).rejects.toMatchObject({ code: "generation_failed" });
    expect(listings).toBe(0);
  });

  it("resolves the generated_images directory from CODEX_HOME", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "image-asset-home-"));
    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    const requested: string[] = [];
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream(REAL_THREAD_ID),
          stderr: "",
        };
      },
    };
    const artifactPath = join(
      codexHome,
      "generated_images",
      REAL_THREAD_ID,
      "exec-abc.png",
    );

    try {
      await expect(
        createCodexImageRunner(
          executor,
          filesArtifactReader({
            [artifactPath]: "generated artifact",
            [editJob.stagedPath]: "generated artifact",
          }),
          {
            artifactDirectoryLister: {
              async list(path) {
                requested.push(path);
                return ["exec-abc.png"];
              },
            },
          },
        ).run(editJob),
      ).resolves.toBeUndefined();
      expect(requested).toEqual([
        join(codexHome, "generated_images", REAL_THREAD_ID),
      ]);
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      await rm(codexHome, { force: true, recursive: true });
    }
  });

  it("preserves cancellation while inspecting generated artifacts", async () => {
    const controller = new AbortController();
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: realCodexEventStream(REAL_THREAD_ID),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(
        executor,
        filesArtifactReader({
          [REAL_GENERATED_ARTIFACT]: "generated artifact",
          [editJob.stagedPath]: "generated artifact",
        }),
        {
          artifactDirectoryLister: {
            async list() {
              controller.abort();
              throw new Error("cancelled listing");
            },
          },
          generatedImagesDirectory: GENERATED_IMAGES_DIRECTORY,
        },
      ).run({ ...editJob, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("accepts a completed image_generation_call artifact", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "item.completed",
            item: {
              type: "image_generation_call",
              status: "completed",
              saved_path: "/generated/image.png",
            },
          }),
          stderr: "",
        };
      },
    };

    await expect(
      createCodexImageRunner(executor, matchingArtifactReader).run(editJob),
    ).resolves.toBeUndefined();
  });

  it("rejects a staged artifact that differs from the image_gen artifact", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 0,
          stdout: completedImageGenerationEvent,
          stderr: "",
        };
      },
    };
    const artifactReader: CodexImageArtifactReader = {
      async read(path) {
        return Buffer.from(
          path === "/generated/image.png"
            ? "generated artifact"
            : "local replacement",
        );
      },
    };

    await expect(
      createCodexImageRunner(executor, artifactReader).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Generated image does not match the verified image_gen artifact.",
      ),
    );
  });

  it("rejects malformed JSONL evidence", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return { exitCode: 0, stdout: "not json", stderr: "" };
      },
    };

    await expect(createCodexImageRunner(executor).run(editJob)).rejects.toEqual(
      new ImageAssetBatchError(
        "generation_failed",
        "Built-in image generation could not be verified.",
      ),
    );
  });

  it("classifies a transient Codex failure without exposing stderr", async () => {
    const executor: CodexProcessExecutor = {
      async execute() {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "network timeout while contacting service",
        };
      },
    };

    await expect(createCodexImageRunner(executor).run(editJob)).rejects.toEqual(
      new ImageAssetBatchError(
        "transient",
        "Image generation was temporarily unavailable.",
      ),
    );
  });

  it("maps non-transient failures and executor exceptions to safe errors", async () => {
    const failedExecutor: CodexProcessExecutor = {
      async execute() {
        return { exitCode: 1, stdout: "", stderr: "invalid image" };
      },
    };
    const throwingExecutor: CodexProcessExecutor = {
      async execute() {
        throw new Error("sensitive implementation detail");
      },
    };

    await expect(
      createCodexImageRunner(failedExecutor).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError("generation_failed", "Image generation failed."),
    );
    await expect(
      createCodexImageRunner(throwingExecutor).run(editJob),
    ).rejects.toEqual(
      new ImageAssetBatchError("generation_failed", "Image generation failed."),
    );
  });

  it("does not invoke Codex when the operation is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const executor: CodexProcessExecutor = {
      async execute() {
        calls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    await expect(
      createCodexImageRunner(executor).run({
        ...editJob,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(calls).toBe(0);
  });

  it("reports cancellation that happens while Codex is executing", async () => {
    const controller = new AbortController();
    const executor: CodexProcessExecutor = {
      async execute() {
        controller.abort();
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    await expect(
      createCodexImageRunner(executor).run({
        ...editJob,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("createSipsImageDecoder", () => {
  it("accepts only a successful PNG inspection", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const executor: CodexProcessExecutor = {
      async execute(command, args) {
        calls.push({ command, args });
        return { exitCode: 0, stdout: "format: png\n", stderr: "" };
      },
    };

    await expect(
      createSipsImageDecoder(executor).decode("/workspace/image.png"),
    ).resolves.toBe(true);
    expect(calls).toEqual([
      {
        command: "sips",
        args: ["-g", "format", "/workspace/image.png"],
      },
    ]);
  });

  it("returns false for non-PNG, failing, or unavailable inspection", async () => {
    const nonPngExecutor: CodexProcessExecutor = {
      async execute() {
        return { exitCode: 0, stdout: "format: jpeg\n", stderr: "" };
      },
    };
    const failedExecutor: CodexProcessExecutor = {
      async execute() {
        return { exitCode: 1, stdout: "", stderr: "failed" };
      },
    };
    const throwingExecutor: CodexProcessExecutor = {
      async execute() {
        throw new Error("sips unavailable");
      },
    };

    await expect(
      createSipsImageDecoder(nonPngExecutor).decode("/workspace/image.png"),
    ).resolves.toBe(false);
    await expect(
      createSipsImageDecoder(failedExecutor).decode("/workspace/image.png"),
    ).resolves.toBe(false);
    await expect(
      createSipsImageDecoder(throwingExecutor).decode("/workspace/image.png"),
    ).resolves.toBe(false);
  });

  it("preserves cancellation instead of misreporting it as a bad image", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createSipsImageDecoder({
        async execute() {
          throw new Error("should not run");
        },
      }).decode("/workspace/image.png", controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("preserves a cancellation raised by the inspector", async () => {
    await expect(
      createSipsImageDecoder({
        async execute() {
          throw new ImageAssetBatchError("cancelled", "Cancelled.");
        },
      }).decode("/workspace/image.png"),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("localCodexProcessExecutor", () => {
  it("captures a bounded local process result without a shell", async () => {
    await expect(
      localCodexProcessExecutor.execute(
        process.execPath,
        ["-e", "process.stdout.write('out'); process.stderr.write('err');"],
        { cwd: process.cwd() },
      ),
    ).resolves.toEqual({ exitCode: 0, stdout: "out", stderr: "err" });
  });

  it("reports cancellation when an in-flight process is aborted", async () => {
    const controller = new AbortController();
    const execution = localCodexProcessExecutor.execute(
      process.execPath,
      ["-e", "setTimeout(() => process.exit(0), 5000)"],
      { cwd: process.cwd(), signal: controller.signal },
    );
    controller.abort();

    await expect(execution).rejects.toMatchObject({ code: "cancelled" });
  });

  it("rejects immediately when the process signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      localCodexProcessExecutor.execute(process.execPath, ["--version"], {
        cwd: process.cwd(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("propagates an executable launch failure", async () => {
    await expect(
      localCodexProcessExecutor.execute("/definitely/missing-codex", [], {
        cwd: process.cwd(),
      }),
    ).rejects.toThrow();
  });
});
