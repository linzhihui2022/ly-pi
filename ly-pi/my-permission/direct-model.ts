import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ModelClient } from "./types";

export interface DirectModelBinding {
  readonly model: string;
  readonly thinking?: ModelThinkingLevel;
}

export function resolveDirectModel(
  modelClient: ModelClient,
  binding: DirectModelBinding,
) {
  const slash = binding.model.indexOf("/");
  if (slash <= 0 || slash === binding.model.length - 1) return undefined;

  const model = modelClient.find(
    binding.model.slice(0, slash),
    binding.model.slice(slash + 1),
  );
  if (!model) return undefined;

  return { model, reference: `${model.provider}/${model.id}` };
}
