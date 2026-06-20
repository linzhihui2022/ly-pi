import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (text: string, _width: number) => text,
  matchesKey: (data: string, keyId: string) => data === keyId,
  Key: {
    up: "up",
    down: "down",
    left: "left",
    right: "right",
    tab: "tab",
    shift: (key: string) => `shift+${key}`,
    enter: "enter",
    escape: "escape",
    space: "space",
  },
  Editor: class {
    text = "";
    theme: any;
    onSubmit?: (text: string) => void;
    constructor(_tui: any, theme: any) {
      this.theme = theme;
    }
    setText(text: string) {
      this.text = text;
    }
    getText() {
      return this.text;
    }
    handleInput(data: string) {
      if (data === "enter") {
        this.onSubmit?.(this.text);
      }
    }
    render(_width: number): string[] {
      const t = this.theme;
      const sample =
        t.borderColor("-") +
        t.selectList.selectedPrefix(">") +
        t.selectList.selectedText("x") +
        t.selectList.description("d") +
        t.selectList.scrollInfo("s") +
        t.selectList.noMatch("n");
      return [this.text ? `${sample}${this.text}` : sample];
    }
    invalidate() {}
  },
}));

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myAsk from "./index";
import type { QuestionParams, QuestionnaireResult } from "./types";

describe("my-ask extension", () => {
  let registeredTool: any;
  let customResult: QuestionnaireResult | undefined;

  const mockPi = {
    registerTool: vi.fn((def: any) => {
      registeredTool = def;
    }),
  } as unknown as ExtensionAPI;

  const mockTheme = {
    fg: (_c: string, text: string) => text,
    bg: (_c: string, text: string) => text,
    bold: (text: string) => text,
  };

  function makeCtx(hasUI: boolean) {
    customResult = undefined;
    return {
      hasUI,
      cwd: "/tmp",
      ui: {
        custom: vi.fn(async (_factory: any) => {
          return customResult as QuestionnaireResult;
        }),
        notify: vi.fn(),
      },
    };
  }

  beforeEach(() => {
    registeredTool = undefined;
    customResult = undefined;
    vi.clearAllMocks();
  });

  it("registers ask_user_question tool", () => {
    myAsk(mockPi);
    expect(registeredTool).toBeDefined();
    expect(registeredTool.name).toBe("ask_user_question");
    expect(registeredTool.label).toBe("Ask User Question");
    expect(registeredTool.parameters).toBeDefined();
  });

  it("exposes promptGuidelines as non-empty strings", () => {
    myAsk(mockPi);
    expect(Array.isArray(registeredTool.promptGuidelines)).toBe(true);
    expect(registeredTool.promptGuidelines.length).toBeGreaterThan(0);
    for (const guideline of registeredTool.promptGuidelines) {
      expect(typeof guideline).toBe("string");
      expect(guideline.length).toBeGreaterThan(0);
    }
  });

  it("returns no_ui error when UI is unavailable", async () => {
    myAsk(mockPi);
    const ctx = makeCtx(false);
    const result = await registeredTool.execute(
      "id",
      makeParams(),
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("UI not available");
    expect(result.details.cancelled).toBe(true);
    expect(result.details.error).toBe("no_ui");
  });

  it("returns validation error for invalid params", async () => {
    myAsk(mockPi);
    const ctx = makeCtx(true);
    const result = await registeredTool.execute(
      "id",
      { questions: [] },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("At least one question");
    expect(result.details.error).toBe("no_questions");
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("returns questionnaire response when user answers", async () => {
    myAsk(mockPi);
    const ctx = makeCtx(true);
    customResult = {
      answers: [
        {
          questionIndex: 0,
          question: "Which color?",
          kind: "option",
          answer: "Red",
        },
      ],
      cancelled: false,
    };

    const result = await registeredTool.execute(
      "id",
      makeParams(),
      undefined,
      undefined,
      ctx,
    );

    expect(ctx.ui.custom).toHaveBeenCalled();
    expect(result.content[0].text).toContain(
      "User has answered your questions",
    );
    expect(result.details.cancelled).toBe(false);
  });

  it("returns decline message when user cancels", async () => {
    myAsk(mockPi);
    const ctx = makeCtx(true);
    customResult = { answers: [], cancelled: true };

    const result = await registeredTool.execute(
      "id",
      makeParams(),
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toBe("User declined to answer questions");
    expect(result.details.cancelled).toBe(true);
  });

  it("passes params to the custom UI factory", async () => {
    myAsk(mockPi);
    const ctx = makeCtx(true);
    customResult = { answers: [], cancelled: true };
    const params = makeParams();

    await registeredTool.execute("id", params, undefined, undefined, ctx);

    const factory = ctx.ui.custom.mock.calls[0][0];
    expect(typeof factory).toBe("function");
    const done = vi.fn();
    const component = factory(
      { requestRender: vi.fn() },
      mockTheme,
      undefined,
      done,
    );
    expect(typeof component.render).toBe("function");
    expect(typeof component.handleInput).toBe("function");
  });
});

function makeParams(): QuestionParams {
  return {
    questions: [
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ],
  };
}
