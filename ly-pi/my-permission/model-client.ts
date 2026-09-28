import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { config } from "./config";
import type { DirectModelBinding } from "./direct-model";
import type { ModelClient } from "./types";

export const auditBinding: DirectModelBinding = {
  model: config.auditModel,
  thinking: config.auditThinking,
};

export function createModelClient(ctx: ExtensionContext): ModelClient {
  return {
    find: (provider, id) => ctx.modelRegistry.find(provider, id),
    complete: (model, context, options) =>
      ctx.modelRegistry.complete(model, context, options),
  };
}
