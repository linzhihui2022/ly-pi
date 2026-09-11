import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authorizeImageAssetCall,
  automaticOutputKind,
  buildFinalImagePrompt,
  formatImageAssetProposal,
  imageAssetSchema,
  resolveImageAssetRequest,
} from "./contract";

const tempDirectories: string[] = [];

async function makeWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "image-asset-contract-"));
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

describe("imageAssetSchema", () => {
  it("exposes only the approved request fields", () => {
    const schema = imageAssetSchema as unknown as {
      additionalProperties: boolean;
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "operation",
      "output_paths",
      "overwrite",
      "prompt",
      "reference_path",
      "target_path",
    ]);
    expect(schema.required).toEqual(["operation", "prompt", "output_paths"]);
  });
});

describe("resolveImageAssetRequest", () => {
  it("resolves a generate request into a workspace PNG output", async () => {
    const cwd = await makeWorkspace();

    await expect(
      resolveImageAssetRequest(
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          output_paths: ["assets/fox.png"],
        },
        cwd,
      ),
    ).resolves.toMatchObject({
      operation: "generate",
      outputPaths: [
        {
          absolutePath: join(await realpath(cwd), "assets/fox.png"),
          relativePath: "assets/fox.png",
        },
      ],
      overwrite: false,
    });
  });

  it("rejects an output path that escapes the workspace", async () => {
    const cwd = await makeWorkspace();

    await expect(
      resolveImageAssetRequest(
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          output_paths: ["../fox.png"],
        },
        cwd,
      ),
    ).rejects.toThrow("Image output must stay inside the workspace.");
  });

  it("resolves an edit target and optional reference outside the workspace", async () => {
    const cwd = await makeWorkspace();
    const sources = await makeWorkspace();
    const target = join(sources, "target.png");
    const reference = join(sources, "reference.png");
    await Promise.all([
      writeFile(target, "target"),
      writeFile(reference, "reference"),
    ]);

    await expect(
      resolveImageAssetRequest(
        {
          operation: "edit",
          prompt: "Put a blue moon brooch on the book",
          target_path: target,
          reference_path: reference,
          output_paths: ["assets/fox-edited.png"],
        },
        cwd,
      ),
    ).resolves.toMatchObject({
      targetPath: await realpath(target),
      referencePath: await realpath(reference),
    });
  });

  it("resolves an image source symlink to its real target", async () => {
    const cwd = await makeWorkspace();
    const sources = await makeWorkspace();
    const actualTarget = join(sources, "target.png");
    const targetLink = join(cwd, "target-link.png");
    await writeFile(actualTarget, "target");
    await symlink(actualTarget, targetLink);

    await expect(
      resolveImageAssetRequest(
        {
          operation: "enhance",
          prompt: "Improve the wet-leaf texture",
          target_path: "target-link.png",
          output_paths: ["assets/fox-enhanced.png"],
        },
        cwd,
      ),
    ).resolves.toMatchObject({ targetPath: await realpath(actualTarget) });
  });

  it("rejects source inputs for generation and a missing target for edits", async () => {
    const cwd = await makeWorkspace();
    const source = join(cwd, "source.png");
    await writeFile(source, "source");

    await expect(
      resolveImageAssetRequest(
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          target_path: source,
          output_paths: ["assets/fox.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });

    await expect(
      resolveImageAssetRequest(
        {
          operation: "edit",
          prompt: "Put a blue moon brooch on the book",
          output_paths: ["assets/fox-edited.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it.each([
    {
      name: "a blank prompt",
      request: { prompt: "   ", output_paths: ["assets/fox.png"] },
    },
    {
      name: "no output paths",
      request: { prompt: "A fox", output_paths: [] },
    },
    {
      name: "more than four output paths",
      request: {
        prompt: "A fox",
        output_paths: ["a.png", "b.png", "c.png", "d.png", "e.png"],
      },
    },
    {
      name: "duplicate output paths",
      request: { prompt: "A fox", output_paths: ["a.png", "a.png"] },
    },
    {
      name: "an unverified output format",
      request: { prompt: "A fox", output_paths: ["assets/fox.jpg"] },
    },
  ])("rejects $name", async ({ request }) => {
    const cwd = await makeWorkspace();

    await expect(
      resolveImageAssetRequest({ operation: "generate", ...request }, cwd),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects an absolute output path", async () => {
    const cwd = await makeWorkspace();

    await expect(
      resolveImageAssetRequest(
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          output_paths: [join(cwd, "assets/fox.png")],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("returns a safe invalid-source failure when an edit target cannot resolve", async () => {
    const cwd = await makeWorkspace();

    await expect(
      resolveImageAssetRequest(
        {
          operation: "edit",
          prompt: "Add a blue moon brooch",
          target_path: "missing.png",
          output_paths: ["assets/fox-edited.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({
      code: "invalid_source",
      message: "Image source path cannot be resolved.",
    });
  });

  it("rejects an output whose symlinked parent resolves outside the workspace", async () => {
    const cwd = await makeWorkspace();
    const outside = await makeWorkspace();
    const linkedParent = join(cwd, "linked-assets");
    await mkdir(outside, { recursive: true });
    await symlink(outside, linkedParent);

    await expect(
      resolveImageAssetRequest(
        {
          operation: "generate",
          prompt: "A fox reading under a lantern",
          output_paths: ["linked-assets/fox.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "unsafe_path" });
  });

  it("rejects a source path reused as an output path", async () => {
    const cwd = await makeWorkspace();
    const target = join(cwd, "target.png");
    await writeFile(target, "target");

    await expect(
      resolveImageAssetRequest(
        {
          operation: "enhance",
          prompt: "Improve the wet-leaf texture",
          target_path: target,
          output_paths: ["target.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects a reference path that resolves to the image target", async () => {
    const cwd = await makeWorkspace();
    const target = join(cwd, "target.png");
    await writeFile(target, "target");

    await expect(
      resolveImageAssetRequest(
        {
          operation: "edit",
          prompt: "Add a blue moon brooch",
          target_path: target,
          reference_path: target,
          output_paths: ["assets/fox-edited.png"],
        },
        cwd,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("buildFinalImagePrompt", () => {
  it("uses only the request and safe asset metadata", async () => {
    const cwd = await makeWorkspace();
    const sourceDirectory = await makeWorkspace();
    const target = join(sourceDirectory, "target.png");
    const reference = join(sourceDirectory, "reference.png");
    await Promise.all([
      writeFile(target, "TOP_SECRET_TARGET_BYTES"),
      writeFile(reference, "TOP_SECRET_REFERENCE_BYTES"),
    ]);
    const request = await resolveImageAssetRequest(
      {
        operation: "edit",
        prompt: "Add a blue moon brooch to the book cover",
        target_path: target,
        reference_path: reference,
        output_paths: ["assets/fox-edited.png"],
      },
      cwd,
    );

    const prompt = buildFinalImagePrompt(request);

    expect(prompt).toBe(
      [
        "Primary request: Add a blue moon brooch to the book cover",
        "Operation: edit",
        "Image target: target.png",
        "Reference image: reference.png",
        "Output paths: assets/fox-edited.png",
      ].join("\n"),
    );
    expect(prompt).not.toContain(sourceDirectory);
    expect(prompt).not.toContain("TOP_SECRET");
  });
});

describe("automaticOutputKind", () => {
  it("accepts only a bounded automatic generate or derived candidate", () => {
    expect(
      automaticOutputKind(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [".image-gen/wasteland-robot.png"],
        },
        "生成一张废土时代的机器人。",
      ),
    ).toBe("generate");
    expect(
      automaticOutputKind(
        {
          operation: "edit",
          prompt: "Replace the right hand with a weapon",
          target_path: "assets/robot.png",
          output_paths: ["assets/robot-right-hand-weapon.png"],
        },
        "编辑 assets/robot.png，把右手改成武器。",
      ),
    ).toBe("derived");
  });

  it.each([
    {
      name: "a generate path outside .image-gen",
      request: {
        operation: "generate" as const,
        prompt: "A wasteland robot",
        output_paths: ["assets/wasteland-robot.png"],
      },
      text: "生成一张废土时代的机器人。",
    },
    {
      name: "an automatic path that ignores a user-named output",
      request: {
        operation: "generate" as const,
        prompt: "A wasteland robot",
        output_paths: [".image-gen/wasteland-robot.png"],
      },
      text: "生成一张废土时代的机器人，并写到 assets/wasteland-robot.png。",
    },
    {
      name: "a derived path outside the target directory",
      request: {
        operation: "edit" as const,
        prompt: "Replace the right hand with a weapon",
        target_path: "assets/robot.png",
        output_paths: [".image-gen/robot-right-hand-weapon.png"],
      },
      text: "编辑 assets/robot.png，把右手改成武器。",
    },
    {
      name: "a derived candidate for an external target",
      request: {
        operation: "edit" as const,
        prompt: "Replace the right hand with a weapon",
        target_path: "/tmp/robot.png",
        output_paths: ["/tmp/robot-right-hand-weapon.png"],
      },
      text: "编辑 /tmp/robot.png，把右手改成武器。",
    },
    {
      name: "multiple automatic outputs",
      request: {
        operation: "generate" as const,
        prompt: "A wasteland robot",
        output_paths: [
          ".image-gen/wasteland-robot.png",
          ".image-gen/wasteland-robot-2.png",
        ],
      },
      text: "生成一张废土时代的机器人。",
    },
    {
      name: "an automatic overwrite",
      request: {
        operation: "generate" as const,
        prompt: "A wasteland robot",
        output_paths: [".image-gen/wasteland-robot.png"],
        overwrite: true,
      },
      text: "生成一张废土时代的机器人。",
    },
  ])("rejects $name", ({ request, text }) => {
    expect(automaticOutputKind(request, text)).toBeUndefined();
  });
});

describe("authorizeImageAssetCall", () => {
  const generateRequest = {
    operation: "generate" as const,
    prompt: "A fox reading under a lantern",
    output_paths: ["assets/fox.png"],
  };
  const editRequest = {
    operation: "edit" as const,
    prompt: "Add a blue moon brooch",
    target_path: "assets/fox-source.png",
    reference_path: "assets/moon-reference.png",
    output_paths: ["assets/fox-edited.png"],
  };

  it("authorizes a direct explicit request with every supplied path", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        {
          role: "user",
          text: "请生成一张读书狐狸插画，并写到 assets/fox.png。",
        },
      ]),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it.each([
    {
      name: "a negated image request",
      request: generateRequest,
      text: "不要生成图片并写到 assets/fox.png。",
    },
    {
      name: "a lookalike output path",
      request: generateRequest,
      text: "请生成一张读书狐狸插画，并写到 assets/fox.png.bak。",
    },
    {
      name: "an implicit overwrite",
      request: { ...generateRequest, overwrite: true },
      text: "请生成一张读书狐狸插画，并写到 assets/fox.png。",
    },
    {
      name: "a negated overwrite",
      request: { ...generateRequest, overwrite: true },
      text: "请生成一张读书狐狸插画，但不要覆盖 assets/fox.png。",
    },
  ])("rejects $name", ({ request, text }) => {
    expect(authorizeImageAssetCall(request, [{ role: "user", text }])).toEqual({
      authorized: false,
      reason: "missing_explicit_request",
    });
  });

  it("authorizes a path followed by English terminal punctuation", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        {
          role: "user",
          text: "Generate an image of a fox reading and save it to assets/fox.png.",
        },
      ]),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it("authorizes an explicit overwrite request", () => {
    expect(
      authorizeImageAssetCall({ ...generateRequest, overwrite: true }, [
        {
          role: "user",
          text: "请生成一张读书狐狸插画，并覆盖 assets/fox.png。",
        },
      ]),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it("recognizes a Chinese one-picture request without another image noun", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        {
          role: "user",
          text: "请生成一张废土时代的机器人，并写到 assets/fox.png。",
        },
      ]),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it("recognizes a Chinese one-picture request as the source of a confirmation", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        {
          role: "user",
          text: "请生成一张废土时代的机器人。",
        },
        { role: "assistant", text: formatImageAssetProposal(generateRequest) },
        { role: "user", text: "CONFIRM_IMAGE_ASSET" },
      ]),
    ).toEqual({ authorized: true, mode: "confirmed" });
  });

  it("authorizes a clear direct request with a bounded automatic output", () => {
    expect(
      authorizeImageAssetCall(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [".image-gen/wasteland-robot.png"],
        },
        [{ role: "user", text: "生成一张废土时代的机器人。" }],
      ),
    ).toEqual({ authorized: true, mode: "direct" });
    expect(
      authorizeImageAssetCall(
        {
          operation: "edit",
          prompt: "Replace the right hand with a weapon",
          target_path: "assets/robot.png",
          output_paths: ["assets/robot-right-hand-weapon.png"],
        },
        [
          {
            role: "user",
            text: "编辑 assets/robot.png，把右手改成武器。",
          },
        ],
      ),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it("does not substitute an automatic path for a user-named output", () => {
    expect(
      authorizeImageAssetCall(
        {
          operation: "generate",
          prompt: "A wasteland robot",
          output_paths: [".image-gen/wasteland-robot.png"],
        },
        [
          {
            role: "user",
            text: "生成一张废土时代的机器人，并写到 assets/wasteland-robot.png。",
          },
        ],
      ),
    ).toEqual({ authorized: false, reason: "missing_explicit_request" });
  });

  it("rejects a request that lacks an explicit image instruction", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        {
          role: "user",
          text: "Please update assets/fox.png when you have time.",
        },
      ]),
    ).toEqual({ authorized: false, reason: "missing_explicit_request" });
  });

  it("rejects a direct edit request that omits a supplied reference path", () => {
    expect(
      authorizeImageAssetCall(editRequest, [
        {
          role: "user",
          text: "请编辑 assets/fox-source.png，并将结果写到 assets/fox-edited.png。",
        },
      ]),
    ).toEqual({ authorized: false, reason: "missing_explicit_request" });
  });

  it("rejects a vague direct enhancement but permits a stated enhancement goal", () => {
    const enhanceRequest = {
      operation: "enhance" as const,
      prompt: "Improve wet-leaf texture and reduce noise",
      target_path: "assets/fox-source.png",
      output_paths: ["assets/fox-enhanced.png"],
    };

    expect(
      authorizeImageAssetCall(enhanceRequest, [
        {
          role: "user",
          text: "请优化图片 assets/fox-source.png，并写到 assets/fox-enhanced.png。",
        },
      ]),
    ).toEqual({ authorized: false, reason: "missing_explicit_request" });
    expect(
      authorizeImageAssetCall(enhanceRequest, [
        {
          role: "user",
          text: "请增强图片 assets/fox-source.png 的湿叶纹理并降低噪点，写到 assets/fox-enhanced.png。",
        },
      ]),
    ).toEqual({ authorized: true, mode: "direct" });
  });

  it("authorizes an exact confirmed proposal after an explicit source request", () => {
    expect(
      authorizeImageAssetCall(editRequest, [
        {
          role: "user",
          text: "请编辑 assets/fox-source.png，参考 assets/moon-reference.png 的配色。",
        },
        { role: "assistant", text: formatImageAssetProposal(editRequest) },
        { role: "user", text: "CONFIRM_IMAGE_ASSET" },
      ]),
    ).toEqual({ authorized: true, mode: "confirmed" });
  });

  it("rejects a confirmation when the preceding proposal has different paths", () => {
    expect(
      authorizeImageAssetCall(editRequest, [
        {
          role: "user",
          text: "请编辑 assets/fox-source.png，参考 assets/moon-reference.png 的配色。",
        },
        {
          role: "assistant",
          text: formatImageAssetProposal({
            ...editRequest,
            output_paths: ["assets/other.png"],
          }),
        },
        { role: "user", text: "确认图片资产" },
      ]),
    ).toEqual({ authorized: false, reason: "confirmation_required" });
  });

  it("rejects a bare confirmation without a prior explicit request", () => {
    expect(
      authorizeImageAssetCall(generateRequest, [
        { role: "assistant", text: formatImageAssetProposal(generateRequest) },
        { role: "user", text: "CONFIRM_IMAGE_ASSET" },
      ]),
    ).toEqual({ authorized: false, reason: "missing_explicit_request" });
  });
});
