/**
 * Injected when the active model supports image input: read images directly.
 */
export const VISION_DIRECT_HINT = `## Vision

- You have vision capability. When the user asks you to analyze an image, screenshot, chart, or diagram, read it directly with the \`read\` tool — images are sent as attachments.
- Do NOT delegate image analysis to the \`image-reader\` subagent; delegation exists only for models without vision capability.`;

/**
 * Injected when the active model lacks image input: delegate to image-reader.
 */
export const VISION_DELEGATION_RULES = `## Vision Delegation

- You do not have vision capability. When the user asks you to analyze an image, screenshot, chart, or diagram, delegate to the \`image-reader\` subagent (model: kimi-coding/k3-256k) via \`subagent({ agent: "image-reader", task: "..." })\`.
- Do NOT attempt to analyze images yourself — you cannot see them. Always use \`image-reader\`.
- **Temp dir handling**: If the image path is under a system temp directory (e.g., \`/var/folders/\`, \`/tmp/\`, \`/private/var/\`), copy it to \`.scratch/\` with \`cp\` (keeping the original filename to avoid collisions between concurrent images), then pass the \`.scratch/\` path to image-reader. Subagents cannot read from temp directories due to Pi security policy. After image-reader completes, delete the copied file with \`rm\`.`;

/**
 * Pick the system-prompt suffix for the active model. Unknown or missing
 * model metadata falls back to delegation (the safe path: the subagent
 * always has vision).
 */
export function visionPromptSuffix(
  model: { input: readonly string[] } | undefined,
): string {
  const hasVision = model?.input.includes("image") ?? false;
  return hasVision ? VISION_DIRECT_HINT : VISION_DELEGATION_RULES;
}
