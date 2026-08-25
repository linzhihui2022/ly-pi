import { describe, expect, it, vi } from "vitest";
import myModelPolicy from "./index";

describe("my-model-policy", () => {
  it("registers a no-request models-doctor command", async () => {
    let command:
      | {
          handler: (args: string | undefined, ctx: unknown) => Promise<void>;
        }
      | undefined;
    const pi = {
      registerCommand: vi.fn((_name, definition) => {
        command = definition;
      }),
    };
    const describeModels = vi.fn(() => ({
      primary: {
        expected: "test/fast",
        actual: "other/recovered",
        deviates: true,
      },
      roles: {
        vision: {
          policy: "vision-policy",
          failurePolicy: "error",
          candidates: [
            {
              slot: "primary",
              model: "test/vision",
              label: "Vision test model",
              thinking: "max",
              source: "manifest",
              status: "incompatible",
              diagnostics: ["missing input: image"],
            },
          ],
        },
      },
    }));
    const complete = vi.fn();
    const notify = vi.fn();
    const ctx = {
      model: { provider: "other", id: "recovered" },
      modelRegistry: { complete },
      ui: { notify },
    };

    myModelPolicy(pi as never, () => ({ describe: describeModels }) as never);
    await command?.handler(undefined, ctx);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "models-doctor",
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(describeModels).toHaveBeenCalledWith(ctx.modelRegistry, ctx.model);
    expect(complete).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("other/recovered"),
      "warning",
    );
    expect(notify.mock.calls[0][0]).toContain("vision → vision-policy");
    expect(notify.mock.calls[0][0]).toContain("missing input: image");
  });
});
