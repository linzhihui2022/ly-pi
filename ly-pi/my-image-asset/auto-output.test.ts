import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAutomaticImageAssetRequest } from "./auto-output";

const temporaryDirectories: string[] = [];

async function makeWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "image-asset-auto-output-"));
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

describe("resolveAutomaticImageAssetRequest", () => {
  it("increments a colliding generated candidate in .image-gen", async () => {
    const cwd = await makeWorkspace();
    const existing = join(cwd, ".image-gen/wasteland-robot.png");
    await mkdir(join(cwd, ".image-gen"), { recursive: true });
    await writeFile(existing, "existing asset");

    await expect(
      resolveAutomaticImageAssetRequest(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [".image-gen/wasteland-robot.png"],
        },
        cwd,
        "generate",
      ),
    ).resolves.toMatchObject({
      outputPaths: [{ relativePath: ".image-gen/wasteland-robot-2.png" }],
      overwrite: false,
    });
  });

  it("increments a colliding derived candidate beside its explicit target", async () => {
    const cwd = await makeWorkspace();
    const source = join(cwd, "assets/robot.png");
    const existing = join(cwd, "assets/robot-right-hand-weapon.png");
    await mkdir(join(cwd, "assets"), { recursive: true });
    await Promise.all([
      writeFile(source, "source asset"),
      writeFile(existing, "existing asset"),
    ]);

    await expect(
      resolveAutomaticImageAssetRequest(
        {
          operation: "edit",
          prompt: "Replace the right hand with a weapon",
          target_path: "assets/robot.png",
          output_paths: ["assets/robot-right-hand-weapon.png"],
        },
        cwd,
        "derived",
      ),
    ).resolves.toMatchObject({
      outputPaths: [{ relativePath: "assets/robot-right-hand-weapon-2.png" }],
    });
  });

  it("fails after exhausting bounded automatic output candidates", async () => {
    const cwd = await makeWorkspace();
    const outputDirectory = join(cwd, ".image-gen");
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        writeFile(
          join(
            outputDirectory,
            `wasteland-robot${index === 0 ? "" : `-${index + 1}`}.png`,
          ),
          "existing asset",
        ),
      ),
    );

    await expect(
      resolveAutomaticImageAssetRequest(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [".image-gen/wasteland-robot.png"],
        },
        cwd,
        "generate",
      ),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: "An automatic image output path could not be selected.",
    });
  });

  it("rejects an automatic request without an output path", async () => {
    const cwd = await makeWorkspace();

    await expect(
      resolveAutomaticImageAssetRequest(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [],
        } as never,
        cwd,
        "generate",
      ),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: "Automatic image output path is invalid.",
    });
  });

  it("preserves an explicit output path for the batch overwrite policy", async () => {
    const cwd = await makeWorkspace();
    const existing = join(cwd, "assets/robot.png");
    await mkdir(join(cwd, "assets"), { recursive: true });
    await writeFile(existing, "existing asset");

    await expect(
      resolveAutomaticImageAssetRequest(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: ["assets/robot.png"],
        },
        cwd,
        undefined,
      ),
    ).resolves.toMatchObject({
      outputPaths: [{ relativePath: "assets/robot.png" }],
    });
  });
});
