import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ImageAssetBatchError,
  type ImageAssetFileOperations,
  type ImageAssetRunner,
  type ImageDecoder,
  runImageAssetBatch,
} from "./batch";
import {
  type ResolvedImageAssetRequest,
  resolveImageAssetRequest,
} from "./contract";

const tempDirectories: string[] = [];

async function makeWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "image-asset-batch-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("runImageAssetBatch", () => {
  it("stages and publishes requested outputs in path order", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
      },
      cwd,
    );
    const started: string[] = [];
    const runner: ImageAssetRunner = {
      async run(job) {
        started.push(job.output.relativePath);
        await writeFile(job.stagedPath, job.output.relativePath);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    const result = await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(started).toEqual(["assets/first.png", "assets/second.png"]);
    expect(await readFile(join(cwd, "assets/first.png"), "utf8")).toBe(
      "assets/first.png",
    );
    expect(await readFile(join(cwd, "assets/second.png"), "utf8")).toBe(
      "assets/second.png",
    );
    expect(result.outputPaths).toEqual([
      "assets/first.png",
      "assets/second.png",
    ]);
    expect(result.outputs).toEqual([
      { path: "assets/first.png", status: "published" },
      { path: "assets/second.png", status: "published" },
    ]);
  });

  it("does not expose final output paths to the image generator", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png"],
      },
      cwd,
    );
    const prompts: string[] = [];
    const runner: ImageAssetRunner = {
      async run(job) {
        prompts.push(job.finalPrompt);
        await writeFile(job.stagedPath, "image bytes");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(
      "Primary request: A fox reading under a lantern",
    );
    expect(prompts[0]).not.toContain("Output paths:");
    expect(prompts[0]).not.toContain("assets/first.png");
  });

  it("passes the canonical workspace to the runner", async () => {
    const realCwd = await makeWorkspace();
    const linkParent = await makeWorkspace();
    const linkedCwd = join(linkParent, "linked-workspace");
    await symlink(realCwd, linkedCwd);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      linkedCwd,
    );
    let runnerCwd = "";
    const runner: ImageAssetRunner = {
      async run(job) {
        runnerCwd = job.cwd;
        await mkdir(dirname(job.stagedPath), { recursive: true });
        await writeFile(job.stagedPath, "generated image");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, linkedCwd, { runner, decoder });

    expect(runnerCwd).toBe(await realpath(realCwd));
  });

  it("rejects an unvalidated request that would overwrite its source", async () => {
    const cwd = await makeWorkspace();
    const target = join(cwd, "assets/target.png");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "original source");
    const request = {
      operation: "enhance",
      prompt: "Improve the source",
      targetPath: target,
      outputPaths: [
        { absolutePath: target, relativePath: "assets/target.png" },
      ],
      overwrite: true,
    } as unknown as ResolvedImageAssetRequest;
    let calls = 0;
    const runner: ImageAssetRunner = {
      async run(job) {
        calls += 1;
        await writeFile(job.stagedPath, "replacement");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(calls).toBe(0);
    await expect(readFile(target, "utf8")).resolves.toBe("original source");
  });

  it("rejects a resolved request whose relative and absolute outputs disagree", async () => {
    const cwd = await makeWorkspace();
    const request = {
      operation: "generate",
      prompt: "A fox reading under a lantern",
      outputPaths: [
        {
          absolutePath: join(cwd, "assets/real.png"),
          relativePath: "assets/other.png",
        },
      ],
      overwrite: false,
    } as unknown as ResolvedImageAssetRequest;
    let calls = 0;
    const runner: ImageAssetRunner = {
      async run() {
        calls += 1;
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(calls).toBe(0);
  });

  it("rejects an unresolved source alias in a resolved request", async () => {
    const cwd = await makeWorkspace();
    const sourceDirectory = join(cwd, "sources");
    const target = join(sourceDirectory, "target.png");
    const aliasDirectory = join(cwd, "alias");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(target, "target");
    await symlink(sourceDirectory, aliasDirectory);
    const request = {
      operation: "edit",
      prompt: "Update the source",
      targetPath: join(aliasDirectory, "target.png"),
      outputPaths: [
        {
          absolutePath: join(cwd, "assets/output.png"),
          relativePath: "assets/output.png",
        },
      ],
      overwrite: false,
    } as unknown as ResolvedImageAssetRequest;
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("accepts an output through an in-workspace symlinked parent", async () => {
    const cwd = await makeWorkspace();
    const actualDirectory = join(cwd, "actual-assets");
    const linkedDirectory = join(cwd, "linked-assets");
    await mkdir(actualDirectory, { recursive: true });
    await symlink(actualDirectory, linkedDirectory);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["linked-assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    await expect(
      readFile(join(actualDirectory, "fox.png"), "utf8"),
    ).resolves.toBe("generated asset");
  });

  it("rejects malformed resolved request shapes before generation", async () => {
    const cwd = await makeWorkspace();
    const output = {
      absolutePath: join(cwd, "assets/output.png"),
      relativePath: "assets/output.png",
    };
    const valid = {
      operation: "generate",
      prompt: "A fox",
      outputPaths: [output],
      overwrite: false,
    };
    const requests = [
      null,
      { ...valid, operation: "unknown" },
      { ...valid, prompt: "   " },
      { ...valid, overwrite: "false" },
      { ...valid, outputPaths: "assets/output.png" },
      { ...valid, targetPath: join(cwd, "target.png") },
      { ...valid, referencePath: join(cwd, "reference.png") },
      { ...valid, operation: "edit" },
      { ...valid, operation: "edit", targetPath: 42 },
      { ...valid, operation: "edit", targetPath: "target.png" },
      { ...valid, outputPaths: [null] },
      {
        ...valid,
        outputPaths: [{ ...output, relativePath: "/absolute/output.png" }],
      },
      {
        ...valid,
        outputPaths: [{ ...output, relativePath: "assets/output.jpg" }],
      },
      {
        ...valid,
        outputPaths: [{ ...output, absolutePath: "/outside/output.png" }],
      },
      {
        ...valid,
        outputPaths: [{ ...output, relativePath: "assets/\0.png" }],
      },
      { ...valid, outputPaths: [output, output] },
    ];
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    for (const request of requests) {
      await expect(
        runImageAssetBatch(
          request as unknown as ResolvedImageAssetRequest,
          cwd,
          { runner, decoder },
        ),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
  });

  it("rejects a resolved request with duplicate canonical source files", async () => {
    const cwd = await makeWorkspace();
    const target = join(cwd, "target.png");
    await mkdir(join(cwd, "nested"), { recursive: true });
    await writeFile(target, "target");
    const request = {
      operation: "edit",
      prompt: "Update the source",
      targetPath: target,
      referencePath: join(cwd, "nested", "..", "target.png"),
      outputPaths: [
        {
          absolutePath: join(cwd, "assets/output.png"),
          relativePath: "assets/output.png",
        },
      ],
      overwrite: false,
    } as unknown as ResolvedImageAssetRequest;
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects an absolute source path that does not exist", async () => {
    const cwd = await makeWorkspace();
    const request = {
      operation: "edit",
      prompt: "Update the source",
      targetPath: join(cwd, "missing.png"),
      outputPaths: [
        {
          absolutePath: join(cwd, "assets/output.png"),
          relativePath: "assets/output.png",
        },
      ],
      overwrite: false,
    } as unknown as ResolvedImageAssetRequest;
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("reports output inspection failures without starting generation", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const outputPath = request.outputPaths[0]!.absolutePath;
    const fileOperations: ImageAssetFileOperations = {
      lstat: async (path) => {
        if (path === outputPath) {
          const error = new Error("permission denied");
          Object.assign(error, { code: "EACCES" });
          throw error;
        }
        return lstat(path);
      },
      mkdir,
      mkdtemp,
      link,
      rename,
      rm,
    };
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        fileOperations,
      }),
    ).rejects.toMatchObject({ code: "publish_failed" });
  });

  it("maps publication journal write failures to a safe publish error", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let stagingDirectory = "";
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp: async (prefix) => {
        stagingDirectory = await mkdtemp(prefix);
        await mkdir(join(stagingDirectory, ".image-asset-publish.json"), {
          recursive: true,
        });
        return stagingDirectory;
      },
      link,
      rename,
      rm,
    };
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        fileOperations,
      }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(access(stagingDirectory)).rejects.toThrow();
  });

  it("honors cancellation after generation or decoding completes", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const controller = new AbortController();
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
        controller.abort();
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        throw new Error("decoder must not be called");
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });

    const secondController = new AbortController();
    const secondRunner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const secondDecoder: ImageDecoder = {
      async decode() {
        secondController.abort();
        return true;
      },
    };
    await expect(
      runImageAssetBatch(request, cwd, {
        runner: secondRunner,
        decoder: secondDecoder,
        signal: secondController.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("maps decoder exceptions to an invalid-output failure", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        throw new Error("decoder detail");
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toEqual(
      new ImageAssetBatchError(
        "invalid_output",
        "Generated image is not decodable.",
      ),
    );
  });

  it("discards the whole batch when a staged image does not decode", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "not an image");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return false;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    await expect(access(join(cwd, "assets/first.png"))).rejects.toThrow();
    await expect(access(join(cwd, "assets/second.png"))).rejects.toThrow();
  });

  it("retries a transient generation failure once before publishing", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let attempts = 0;
    const runner: ImageAssetRunner = {
      async run(job) {
        attempts += 1;
        if (attempts === 1) {
          throw new ImageAssetBatchError("transient", "Temporary failure.");
        }
        await writeFile(job.stagedPath, "recovered");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(attempts).toBe(2);
    expect(await readFile(join(cwd, "assets/fox.png"), "utf8")).toBe(
      "recovered",
    );
  });

  it("does not publish an artifact left by a failed transient attempt", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let attempts = 0;
    const runner: ImageAssetRunner = {
      async run(job) {
        attempts += 1;
        if (attempts === 1) {
          await writeFile(job.stagedPath, "stale image");
          throw new ImageAssetBatchError("transient", "Temporary failure.");
        }
      },
    };
    const decoder: ImageDecoder = {
      async decode(path) {
        try {
          await access(path);
          return true;
        } catch {
          return false;
        }
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    await expect(access(join(cwd, "assets/fox.png"))).rejects.toThrow();
  });

  it("rejects a staged symlink even when the decoder accepts it", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const outsideImage = join(outside, "outside.png");
    await writeFile(outsideImage, "outside image");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await symlink(outsideImage, job.stagedPath);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    await expect(access(join(cwd, "assets/fox.png"))).rejects.toThrow();
  });

  it("refuses publication when Codex replaces an output parent with a symlink", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const outputDirectory = join(cwd, "assets");
    await mkdir(outputDirectory, { recursive: true });
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/nested/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated image");
        await rm(outputDirectory, { force: true, recursive: true });
        await symlink(outside, outputDirectory);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(access(join(outside, "nested"))).rejects.toThrow();
  });

  it("fails after a second transient error without publishing earlier outputs", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
      },
      cwd,
    );
    const attempts: Record<string, number> = {};
    const runner: ImageAssetRunner = {
      async run(job) {
        attempts[job.output.relativePath] =
          (attempts[job.output.relativePath] ?? 0) + 1;
        if (job.output.relativePath === "assets/second.png") {
          throw new ImageAssetBatchError("transient", "Temporary failure.");
        }
        await writeFile(job.stagedPath, "first output");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "transient" });

    expect(attempts).toEqual({ "assets/first.png": 1, "assets/second.png": 2 });
    await expect(access(join(cwd, "assets/first.png"))).rejects.toThrow();
    await expect(access(join(cwd, "assets/second.png"))).rejects.toThrow();
  });

  it("does not generate or overwrite an existing output without overwrite", async () => {
    const cwd = await makeWorkspace();
    const existing = join(cwd, "assets/fox.png");
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, "old asset");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let calls = 0;
    const runner: ImageAssetRunner = {
      async run() {
        calls += 1;
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "output_exists" });

    expect(calls).toBe(0);
    expect(await readFile(existing, "utf8")).toBe("old asset");
  });

  it("rejects an output that appears before the final no-overwrite check", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, "raced asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "output_exists" });
    await expect(readFile(output, "utf8")).resolves.toBe("raced asset");
  });

  it("does not replace an output created after the no-overwrite check", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp,
      link: async (from, to) => {
        await mkdir(dirname(to), { recursive: true });
        await writeFile(to, "raced asset");
        await link(from, to);
      },
      rename,
      rm,
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "output_exists" });
    await expect(readFile(output, "utf8")).resolves.toBe("raced asset");
  });

  it("maps a non-race link failure to a publish error", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp,
      link: async () => {
        throw new Error("link failure");
      },
      rename,
      rm,
    };
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(access(join(cwd, "assets/fox.png"))).rejects.toThrow();
  });

  it("overwrites existing outputs only when overwrite is explicit", async () => {
    const cwd = await makeWorkspace();
    const existing = join(cwd, "assets/fox.png");
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, "old asset");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
        overwrite: true,
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(await readFile(existing, "utf8")).toBe("new asset");
  });

  it("restores every overwritten output when a later publish fails", async () => {
    const cwd = await makeWorkspace();
    const first = join(cwd, "assets/first.png");
    const second = join(cwd, "assets/second.png");
    await mkdir(dirname(first), { recursive: true });
    await Promise.all([
      writeFile(first, "old first"),
      writeFile(second, "old second"),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
        overwrite: true,
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, `new ${job.output.relativePath}`);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp,
      link,
      rename: async (from, to) => {
        if (
          to === request.outputPaths[1]!.absolutePath &&
          basename(from) === "1.png"
        ) {
          throw new Error("publish failed");
        }
        await rename(from, to);
      },
      rm,
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "publish_failed" });

    expect(await readFile(first, "utf8")).toBe("old first");
    expect(await readFile(second, "utf8")).toBe("old second");
  });

  it("preserves backups when rollback cannot restore them", async () => {
    const cwd = await makeWorkspace();
    const first = join(cwd, "assets/first.png");
    const second = join(cwd, "assets/second.png");
    await mkdir(dirname(first), { recursive: true });
    await Promise.all([
      writeFile(first, "old first"),
      writeFile(second, "old second"),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
        overwrite: true,
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, `new ${job.output.relativePath}`);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };
    let stagingDirectory = "";
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp: async (prefix) => {
        stagingDirectory = await mkdtemp(prefix);
        return stagingDirectory;
      },
      link,
      rename: async (from, to) => {
        if (
          to === request.outputPaths[1]!.absolutePath &&
          basename(from) === "1.png"
        ) {
          throw new Error("publish failed");
        }
        if (
          to === request.outputPaths[0]!.absolutePath &&
          basename(from) === "backup-0.png"
        ) {
          throw new Error("restore failed");
        }
        await rename(from, to);
      },
      rm,
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(
      readFile(join(stagingDirectory, "backup-0.png"), "utf8"),
    ).resolves.toBe("old first");
  });

  it("reports a staging cleanup failure instead of returning success", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let stagingDirectory = "";
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp: async (prefix) => {
        stagingDirectory = await mkdtemp(prefix);
        return stagingDirectory;
      },
      link,
      rename,
      rm: async (path, options) => {
        if (path === stagingDirectory && options.recursive) {
          throw new Error("cleanup failed");
        }
        await rm(path, options);
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "publish_failed", preserveStaging: true });
    await expect(access(stagingDirectory)).resolves.toBeUndefined();
  });

  it("does not publish over a directory named like an image output", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    await mkdir(output, { recursive: true });
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
        overwrite: true,
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(access(output)).resolves.toBeUndefined();
  });

  it("fails closed when a staging directory is replaced by a symlink", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const stagingDirectory = join(cwd, ".image-asset-stage-forged");
    await symlink(outside, stagingDirectory);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp: async () => stagingDirectory,
      link,
      rename,
      rm,
    };
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder, fileOperations }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    await expect(access(outside)).resolves.toBeUndefined();
  });

  it("preserves the primary error when failed cleanup also fails", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    let stagingDirectory = "";
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp: async (prefix) => {
        stagingDirectory = await mkdtemp(prefix);
        return stagingDirectory;
      },
      link,
      rename,
      rm: async (path, options) => {
        if (path === stagingDirectory && options.recursive) {
          throw new Error("cleanup failed");
        }
        await rm(path, options);
      },
    };
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return false;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        fileOperations,
      }),
    ).rejects.toMatchObject({
      code: "invalid_output",
      preserveStaging: true,
    });
  });

  it("recovers an interrupted publication before starting a new batch", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await mkdir(dirname(output), { recursive: true });
    await Promise.all([
      writeFile(output, "partially published asset"),
      writeFile(join(stagingDirectory, "backup-0.png"), "old asset"),
      writeFile(
        join(stagingDirectory, ".image-asset-publish.json"),
        JSON.stringify({
          version: 2,
          stagingDirectoryName: basename(stagingDirectory),
          state: "publishing",
          publications: [
            {
              relativePath: "assets/fox.png",
              stagedFileName: "0.png",
              backupFileName: "backup-0.png",
              hadExistingOutput: true,
              published: false,
            },
          ],
        }),
      ),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(await readFile(output, "utf8")).toBe("old asset");
    await expect(access(stagingDirectory)).rejects.toThrow();
  });

  it("fails closed for a forged journal targeting a non-image file", async () => {
    const cwd = await makeWorkspace();
    const secret = join(cwd, "secrets.txt");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await writeFile(secret, "keep me");
    await writeFile(
      join(stagingDirectory, ".image-asset-publish.json"),
      JSON.stringify({
        version: 2,
        stagingDirectoryName: basename(stagingDirectory),
        state: "publishing",
        publications: [
          {
            relativePath: "secrets.txt",
            stagedFileName: "0.png",
            backupFileName: "backup-0.png",
            hadExistingOutput: false,
            published: true,
          },
        ],
      }),
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(readFile(secret, "utf8")).resolves.toBe("keep me");
  });

  it("fails closed for a malformed publication journal", async () => {
    const cwd = await makeWorkspace();
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await writeFile(
      join(stagingDirectory, ".image-asset-publish.json"),
      "not json",
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed", preserveStaging: true });
  });

  it("rejects a symlinked publication journal", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    const outsideJournal = join(outside, "journal.json");
    await writeFile(outsideJournal, "{}");
    await symlink(
      outsideJournal,
      join(stagingDirectory, ".image-asset-publish.json"),
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed", preserveStaging: true });
  });

  it("does not remove an output outside the workspace from a journal", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const victim = join(outside, "victim.png");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await writeFile(victim, "keep me");
    await writeFile(
      join(stagingDirectory, ".image-asset-publish.json"),
      JSON.stringify({
        version: 2,
        stagingDirectoryName: basename(stagingDirectory),
        state: "publishing",
        publications: [
          {
            relativePath: "../victim.png",
            stagedFileName: "0.png",
            backupFileName: "backup-0.png",
            hadExistingOutput: false,
            published: true,
          },
        ],
      }),
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run() {
        throw new Error("runner must not be called");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed", preserveStaging: true });
    await expect(readFile(victim, "utf8")).resolves.toBe("keep me");
  });

  it("does not remove a PNG named by an unverified publication journal", async () => {
    const cwd = await makeWorkspace();
    const victim = join(cwd, "victim.png");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await writeFile(victim, "keep me");
    await writeFile(join(stagingDirectory, "0.png"), "unrelated staged file");
    await writeFile(
      join(stagingDirectory, ".image-asset-publish.json"),
      JSON.stringify({
        version: 2,
        stagingDirectoryName: basename(stagingDirectory),
        state: "publishing",
        publications: [
          {
            relativePath: "victim.png",
            stagedFileName: "0.png",
            backupFileName: "backup-0.png",
            hadExistingOutput: false,
            published: true,
          },
        ],
      }),
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed", preserveStaging: true });
    await expect(readFile(victim, "utf8")).resolves.toBe("keep me");
    await expect(access(stagingDirectory)).resolves.toBeUndefined();
  });

  it("does not silently skip a non-empty staging directory without a journal", async () => {
    const cwd = await makeWorkspace();
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await writeFile(join(stagingDirectory, "orphan.png"), "orphan asset");
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "publish_failed" });
    await expect(access(join(stagingDirectory, "orphan.png"))).resolves.toBe(
      undefined,
    );
  });

  it("recovers a no-overwrite publication from a hard-link journal", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    const stagedPath = join(stagingDirectory, "0.png");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(stagedPath, "published asset");
    await link(stagedPath, output);
    await writeFile(
      join(stagingDirectory, ".image-asset-publish.json"),
      JSON.stringify({
        version: 2,
        stagingDirectoryName: basename(stagingDirectory),
        state: "publishing",
        publications: [
          {
            relativePath: "assets/fox.png",
            stagedFileName: "0.png",
            backupFileName: "backup-0.png",
            hadExistingOutput: false,
            published: false,
          },
        ],
      }),
    );
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    await expect(access(output)).rejects.toThrow();
  });

  it("keeps committed outputs while removing a completed recovery journal", async () => {
    const cwd = await makeWorkspace();
    const output = join(cwd, "assets/fox.png");
    const stagingDirectory = await mkdtemp(join(cwd, ".image-asset-stage-"));
    await mkdir(dirname(output), { recursive: true });
    await Promise.all([
      writeFile(output, "published asset"),
      writeFile(join(stagingDirectory, "backup-0.png"), "old asset"),
      writeFile(
        join(stagingDirectory, ".image-asset-publish.json"),
        JSON.stringify({
          version: 2,
          stagingDirectoryName: basename(stagingDirectory),
          state: "committed",
          publications: [
            {
              relativePath: "assets/fox.png",
              stagedFileName: "0.png",
              backupFileName: "backup-0.png",
              hadExistingOutput: true,
              published: true,
            },
          ],
        }),
      ),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/new.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "new asset");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await runImageAssetBatch(request, cwd, { runner, decoder });

    expect(await readFile(output, "utf8")).toBe("published asset");
    await expect(access(stagingDirectory)).rejects.toThrow();
  });

  it("does not start a batch after cancellation", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const runner: ImageAssetRunner = {
      async run() {
        calls += 1;
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });

    expect(calls).toBe(0);
    await expect(access(join(cwd, "assets/fox.png"))).rejects.toThrow();
  });

  it("preserves cancellation reported by the image decoder", async () => {
    const cwd = await makeWorkspace();
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/fox.png"],
      },
      cwd,
    );
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, "generated");
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        throw new ImageAssetBatchError("cancelled", "Cancelled.");
      },
    };

    await expect(
      runImageAssetBatch(request, cwd, { runner, decoder }),
    ).rejects.toMatchObject({ code: "cancelled" });
    await expect(access(join(cwd, "assets/fox.png"))).rejects.toThrow();
  });

  it("rolls back all published outputs when cancelled during publication", async () => {
    const cwd = await makeWorkspace();
    const first = join(cwd, "assets/first.png");
    const second = join(cwd, "assets/second.png");
    await mkdir(dirname(first), { recursive: true });
    await Promise.all([
      writeFile(first, "old first"),
      writeFile(second, "old second"),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "generate",
        prompt: "A fox reading under a lantern",
        output_paths: ["assets/first.png", "assets/second.png"],
        overwrite: true,
      },
      cwd,
    );
    const controller = new AbortController();
    const runner: ImageAssetRunner = {
      async run(job) {
        await writeFile(job.stagedPath, `new ${job.output.relativePath}`);
      },
    };
    const decoder: ImageDecoder = {
      async decode() {
        return true;
      },
    };
    const fileOperations: ImageAssetFileOperations = {
      lstat,
      mkdir,
      mkdtemp,
      link,
      rename: async (from, to) => {
        await rename(from, to);
        if (
          to === request.outputPaths[0]!.absolutePath &&
          basename(from) === "0.png"
        ) {
          controller.abort();
        }
      },
      rm,
    };

    await expect(
      runImageAssetBatch(request, cwd, {
        runner,
        decoder,
        fileOperations,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    await expect(readFile(first, "utf8")).resolves.toBe("old first");
    await expect(readFile(second, "utf8")).resolves.toBe("old second");
  });
});
