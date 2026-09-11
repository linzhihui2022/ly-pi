import { describe, expect, it } from "vitest";
import { ImageAssetBatchError, type ImageGenerationJob } from "./batch";
import {
  buildCodexImageCommand,
  type CodexProcessExecutor,
  createCodexImageRunner,
  createSipsImageDecoder,
  localCodexProcessExecutor,
} from "./codex";

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
  it("passes a successful Codex command to the injected executor", async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const executor: CodexProcessExecutor = {
      async execute(command, args) {
        calls.push({ command, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };

    await expect(
      createCodexImageRunner(executor).run(editJob),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe("codex");
    expect(calls[0]!.args).toContain("--image");
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
