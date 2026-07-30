import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VISION_DELEGATION_RULES, VISION_DIRECT_HINT } from "./vision";

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult | undefined>;

const handlers = new Map<string, Handler>();
const mockPi = {
  on: vi.fn((event: string, handler: Handler) => {
    handlers.set(event, handler);
  }),
};

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

async function initExtension() {
  const mod = await import("./index");
  mod.default(mockPi as unknown as ExtensionAPI);
}

function createEvent(): BeforeAgentStartEvent {
  return {
    type: "before_agent_start",
    prompt: "test",
    systemPrompt: "BASE PROMPT",
    systemPromptOptions: {},
  } as unknown as BeforeAgentStartEvent;
}

function createCtx(input: string[] | undefined): ExtensionContext {
  return {
    model: input === undefined ? undefined : { input },
  } as unknown as ExtensionContext;
}

describe("my-vision", () => {
  it("registers a before_agent_start handler", async () => {
    await initExtension();
    expect(handlers.has("before_agent_start")).toBe(true);
  });

  it("appends direct-read hint for vision-capable models", async () => {
    await initExtension();
    const handler = handlers.get("before_agent_start")!;
    const result = await handler(createEvent(), createCtx(["text", "image"]));
    expect(result?.systemPrompt).toBe(`BASE PROMPT\n\n${VISION_DIRECT_HINT}`);
  });

  it("appends delegation rules for text-only models", async () => {
    await initExtension();
    const handler = handlers.get("before_agent_start")!;
    const result = await handler(createEvent(), createCtx(["text"]));
    expect(result?.systemPrompt).toBe(
      `BASE PROMPT\n\n${VISION_DELEGATION_RULES}`,
    );
  });

  it("appends delegation rules when no model is active", async () => {
    await initExtension();
    const handler = handlers.get("before_agent_start")!;
    const result = await handler(createEvent(), createCtx(undefined));
    expect(result?.systemPrompt).toBe(
      `BASE PROMPT\n\n${VISION_DELEGATION_RULES}`,
    );
  });
});
