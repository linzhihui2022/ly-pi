import { describe, expect, it } from "vitest";
import {
  VISION_DELEGATION_RULES,
  VISION_DIRECT_HINT,
  visionPromptSuffix,
} from "./vision";

describe("visionPromptSuffix", () => {
  it("returns direct-read hint for models with image input", () => {
    const suffix = visionPromptSuffix({ input: ["text", "image"] });
    expect(suffix).toBe(VISION_DIRECT_HINT);
  });

  it("direct-read hint instructs reading images via the read tool", () => {
    expect(VISION_DIRECT_HINT).toContain("read");
    expect(VISION_DIRECT_HINT).toContain("Do NOT delegate");
    expect(VISION_DIRECT_HINT).not.toContain("Temp dir handling");
  });

  it("returns delegation rules for text-only models", () => {
    const suffix = visionPromptSuffix({ input: ["text"] });
    expect(suffix).toBe(VISION_DELEGATION_RULES);
  });

  it("delegation rules delegate to the image-reader subagent", () => {
    expect(VISION_DELEGATION_RULES).toContain("image-reader");
    expect(VISION_DELEGATION_RULES).toContain("Temp dir handling");
  });

  it("falls back to delegation rules when model is undefined", () => {
    expect(visionPromptSuffix(undefined)).toBe(VISION_DELEGATION_RULES);
  });

  it("falls back to delegation rules when input is empty", () => {
    expect(visionPromptSuffix({ input: [] })).toBe(VISION_DELEGATION_RULES);
  });
});
