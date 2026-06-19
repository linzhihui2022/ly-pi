/**
 * Maps Pi tool/lifecycle events to pet impact magnitudes.
 */

import type { EventMagnitude, PetEventImpact } from "./types";

export const EVENT_IMPACTS: Record<EventMagnitude, PetEventImpact> = {
  "positive-small": { mood: 3, energy: 1, hunger: 1 },
  "positive-large": { mood: 10, energy: 2, hunger: 2 },
  "negative-small": { mood: -3, energy: -1 },
  "negative-large": { mood: -8, energy: -3 },
};

/**
 * Classify a Pi event into a pet impact magnitude.
 * Returns null if the event is not mapped.
 */
export function classifyEvent(
  eventName: string,
  payload?: unknown,
): EventMagnitude | null {
  const p = payload as Record<string, unknown> | undefined;

  if (eventName === "tool_result") {
    if (p?.test && typeof p.test === "object") {
      const t = p.test as Record<string, unknown>;
      return t.passed === true ? "positive-small" : "negative-small";
    }
    if (p?.build && typeof p.build === "object") {
      const b = p.build as Record<string, unknown>;
      return b.status === "success" ? "positive-large" : "negative-large";
    }
    if (p?.deploy && typeof p.deploy === "object") {
      const d = p.deploy as Record<string, unknown>;
      return d.status === "success" ? "positive-large" : "negative-large";
    }
    if (p?.lint && typeof p.lint === "object") {
      return (p.lint as Record<string, unknown>).errors != null
        ? "negative-small"
        : null;
    }
    return null;
  }

  if (eventName === "git_push") return "positive-small";
  if (eventName === "agent_error") return "negative-small";
  if (eventName === "tool_error") return "negative-small";

  return null;
}
