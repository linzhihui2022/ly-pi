import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
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
import { resolveImageAssetRequest } from "./contract";

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
          version: 1,
          state: "publishing",
          publications: [
            {
              relativePath: "assets/fox.png",
              stagedFileName: "0.png",
              backupFileName: "backup-0.png",
              hadExistingOutput: true,
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
          version: 1,
          state: "committed",
          publications: [
            {
              relativePath: "assets/fox.png",
              stagedFileName: "0.png",
              backupFileName: "backup-0.png",
              hadExistingOutput: true,
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
});
