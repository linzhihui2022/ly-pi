import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-tui", () => {
  class Editor {
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
      } else if (data !== "escape") {
        this.text += data;
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
  }

  return {
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
      backspace: "backspace",
      delete: "delete",
    },
    Editor,
  };
});

import { createQuestionnaire } from "./questionnaire";
import type { QuestionParams } from "./types";

const mockTheme = {
  fg: (_c: string, text: string) => text,
  bg: (_c: string, text: string) => text,
  bold: (text: string) => text,
};

const mockTui = { requestRender: vi.fn() };

function makeParams(questions: QuestionParams["questions"]): QuestionParams {
  return { questions };
}

function addCustomOption(q: ReturnType<typeof createQuestionnaire>, value: string) {
  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  for (const char of value) {
    q.handleInput(char);
  }
  q.handleInput("enter");
}

describe("createQuestionnaire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a single-select question", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Which color?"))).toBe(true);
    expect(lines.some((l) => l.includes("1. Red"))).toBe(true);
    expect(lines.some((l) => l.includes("2. Blue"))).toBe(true);
    expect(lines.some((l) => l.includes("3. Type something."))).toBe(true);
    expect(lines.some((l) => l.includes("4. Chat about this"))).toBe(true);
  });

  it("selects an option and submits for a single question", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [{ questionIndex: 0, question: "Which color?", kind: "option", answer: "Red" }],
      cancelled: false,
    });
  });

  it("navigates down and selects the second option", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("down");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [{ questionIndex: 0, question: "Which color?", kind: "option", answer: "Blue" }],
      cancelled: false,
    });
  });

  it("selects chat answer and submits", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [{ questionIndex: 0, question: "Which color?", kind: "chat", answer: "Chat about this" }],
      cancelled: false,
    });
  });

  it("cancels on escape", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("escape");

    expect(done).toHaveBeenCalledWith({ answers: [], cancelled: true });
  });

  it("renders preview and suppresses Type something row", () => {
    const params = makeParams([
      {
        question: "Which layout?",
        header: "Layout",
        options: [
          { label: "Vertical", description: "Top/bottom", preview: "# Vertical\nA\nB" },
          { label: "Side", description: "Left/right", preview: "# Side\nC\nD" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Type something."))).toBe(false);
    expect(lines.some((l) => l.includes("Preview:"))).toBe(true);
    expect(lines.some((l) => l.includes("# Vertical"))).toBe(true);

    q.handleInput("down");
    const lines2 = q.render(80);
    expect(lines2.some((l) => l.includes("# Side"))).toBe(true);
  });

  it("selects option with preview and includes preview in answer", () => {
    const params = makeParams([
      {
        question: "Which layout?",
        header: "Layout",
        options: [
          { label: "Vertical", description: "Top/bottom", preview: "# Vertical" },
          { label: "Side", description: "Left/right" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        {
          questionIndex: 0,
          question: "Which layout?",
          kind: "option",
          answer: "Vertical",
          preview: "# Vertical",
        },
      ],
      cancelled: false,
    });
  });

  it("adds a custom row but does not auto-submit in single-select", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    // focus Type something. and open editor
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");

    q.handleInput("p");
    q.handleInput("i");
    q.handleInput("n");
    q.handleInput("k");
    q.handleInput("enter");

    expect(done).not.toHaveBeenCalled();
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("3. pink (custom)"))).toBe(true);
    expect(lines.some((l) => l.includes("4. Type something."))).toBe(true);
  });

  it("exits custom input mode on escape", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");
    q.handleInput("x");
    q.handleInput("escape");

    expect(done).not.toHaveBeenCalled();
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("3. Type something."))).toBe(true);
  });

  it("supports multi-select with space toggle and enter submit", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
          { label: "C", description: "c" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("space");
    q.handleInput("down");
    q.handleInput("space");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        {
          questionIndex: 0,
          question: "Which features?",
          kind: "multi",
          answer: null,
          selected: ["A", "B"],
        },
      ],
      cancelled: false,
    });
  });

  it("shows Type something row for multi-select", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Type something."))).toBe(true);
    expect(lines.some((l) => l.includes("○ A"))).toBe(true);
    expect(lines.some((l) => l.includes("○ B"))).toBe(true);
  });

  it("supports multi-question tab navigation and submit", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
      {
        question: "Q2?",
        header: "Q2",
        options: [
          { label: "A2", description: "a2" },
          { label: "B2", description: "b2" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("enter");
    expect(done).not.toHaveBeenCalled();

    // Now on Q2; select B2 (second option)
    q.handleInput("down");
    q.handleInput("enter");

    // Answered last question automatically lands on Submit tab
    const submitLines = q.render(80);
    expect(submitLines.some((l) => l.includes("Ready to submit"))).toBe(true);
    expect(submitLines.some((l) => l.includes("Q1: A1"))).toBe(true);
    expect(submitLines.some((l) => l.includes("Q2: B2"))).toBe(true);

    q.handleInput("enter");
    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Q1?", kind: "option", answer: "A1" },
        { questionIndex: 1, question: "Q2?", kind: "option", answer: "B2" },
      ],
      cancelled: false,
    });
  });

  it("wraps around tabs with right/left", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
      {
        question: "Q2?",
        header: "Q2",
        options: [
          { label: "A2", description: "a2" },
          { label: "B2", description: "b2" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    // Q1 -> Q2
    q.handleInput("right");
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Q2?"))).toBe(true);

    // Q2 -> Submit
    q.handleInput("right");
    const submitLines = q.render(80);
    expect(submitLines.some((l) => l.includes("Ready to submit"))).toBe(true);

    // Submit -> Q1 (wrap)
    q.handleInput("right");
    const lines2 = q.render(80);
    expect(lines2.some((l) => l.includes("Q1?"))).toBe(true);

    // Q1 -> Submit (wrap backwards)
    q.handleInput("left");
    const submitLines2 = q.render(80);
    expect(submitLines2.some((l) => l.includes("Ready to submit"))).toBe(true);
  });

  it("does not submit from Submit tab unless all questions are answered", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
      {
        question: "Q2?",
        header: "Q2",
        options: [
          { label: "A2", description: "a2" },
          { label: "B2", description: "b2" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("tab");
    q.handleInput("tab");
    q.handleInput("enter");

    expect(done).not.toHaveBeenCalled();
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Unanswered"))).toBe(true);
  });

  it("renders the submit tab with multi-select summary", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        multiSelect: true,
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("space");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Q1?", kind: "multi", answer: null, selected: ["A1"] },
      ],
      cancelled: false,
    });
  });

  it.each(["backspace", "delete"] as const)("removes a custom row with %s and moves focus up", (key) => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    addCustomOption(q, "pink");

    q.handleInput(key);

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("pink (custom)"))).toBe(false);
    expect(lines.some((l) => l.includes("> 2. Blue"))).toBe(true);
  });

  it("renders an unchecked custom row in multi-select", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    addCustomOption(q, "custom");

    // Toggle the custom row off so it renders unchecked.
    q.handleInput("space");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("○ custom (custom)"))).toBe(true);
  });

  it("removes a custom row from multi-select selections before submit", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    addCustomOption(q, "custom");

    const beforeDelete = q.render(80);
    expect(beforeDelete.some((l) => l.includes("● custom (custom)"))).toBe(true);

    q.handleInput("delete");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: [] },
      ],
      cancelled: false,
    });
  });

  it("shows a transient notice when the custom option limit is reached", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    for (let i = 0; i < 9; i++) {
      // After the first custom option, focus lands on the newly added row,
      // so only one additional down is needed to reach Type something.
      q.handleInput("down");
      if (i === 0) {
        q.handleInput("down");
      }
      q.handleInput("enter");
      for (const char of `custom${i}`) {
        q.handleInput(char);
      }
      q.handleInput("enter");
    }

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Maximum 8 custom options reached."))).toBe(true);

    const questionIndex = lines.findIndex((l) => l.includes("Which color?"));
    const noticeIndex = lines.findIndex((l) => l.includes("Maximum 8 custom options reached."));
    const firstOptionIndex = lines.findIndex((l) => l.includes("1. Red"));
    expect(questionIndex).toBeGreaterThan(-1);
    expect(noticeIndex).toBeGreaterThan(-1);
    expect(firstOptionIndex).toBeGreaterThan(-1);
    expect(noticeIndex).toBeGreaterThan(questionIndex);
    expect(noticeIndex).toBeLessThan(firstOptionIndex);

    // Pressing another key clears the transient notice.
    q.handleInput("up");
    const cleared = q.render(80);
    expect(cleared.some((l) => l.includes("Maximum 8 custom options reached."))).toBe(false);
  });

  it("focuses an existing custom row instead of adding a duplicate", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    addCustomOption(q, "pink");

    // Try to add the same value again.
    q.handleInput("down");
    q.handleInput("enter");
    for (const char of "pink") {
      q.handleInput(char);
    }
    q.handleInput("enter");

    const lines = q.render(80);
    const matches = lines.filter((l) => l.includes("pink (custom)"));
    expect(matches.length).toBe(1);
    expect(lines.some((l) => l.includes("> 3. pink (custom)"))).toBe(true);
  });

  it("ignores delete when a non-custom row is focused", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("delete");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("> 1. Red"))).toBe(true);
  });

  it("removes a custom row and keeps remaining custom rows", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    addCustomOption(q, "first");

    // Add a second custom option; focus is on the first custom row,
    // so only one down is needed to reach Type something.
    q.handleInput("down");
    q.handleInput("enter");
    for (const char of "second") {
      q.handleInput(char);
    }
    q.handleInput("enter");

    const before = q.render(80);
    expect(before.some((l) => l.includes("first (custom)"))).toBe(true);
    expect(before.some((l) => l.includes("second (custom)"))).toBe(true);

    // Focus is on the second custom row; delete it.
    q.handleInput("delete");

    const after = q.render(80);
    expect(after.some((l) => l.includes("second (custom)"))).toBe(false);
    expect(after.some((l) => l.includes("first (custom)"))).toBe(true);
  });

  it("calls invalidate on the editor", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());
    expect(() => q.invalidate()).not.toThrow();
  });

  it("navigates up and clamps at the first row", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("up");
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("> 1. Red"))).toBe(true);

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("up");
    const lines2 = q.render(80);
    expect(lines2.some((l) => l.includes("> 2. Blue"))).toBe(true);
  });

  it("ignores unknown keys", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("?");
    expect(done).not.toHaveBeenCalled();
  });

  it("shows Del remove hint when a single-select custom row is focused", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");
    q.handleInput("x");
    q.handleInput("enter");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("x (custom)"))).toBe(true);
    expect(lines.some((l) => l.includes("Del remove"))).toBe(true);
  });

  it("shows Del remove hint when a multi-select custom row is focused", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    addCustomOption(q, "custom");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("custom (custom)"))).toBe(true);
    expect(lines.some((l) => l.includes("Del remove"))).toBe(true);
  });

  it("shows standard help when a multi-select option row is focused", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Space toggle"))).toBe(true);
    expect(lines.some((l) => l.includes("a all/none"))).toBe(true);
    expect(lines.some((l) => l.includes("Del remove"))).toBe(false);
  });

  it("selects all multi-select rows with a", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("a");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: ["A", "B"] },
      ],
      cancelled: false,
    });
  });

  it("clears all selections when a is pressed and everything is selected", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("a");
    q.handleInput("a");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: [] },
      ],
      cancelled: false,
    });
  });

  it("includes existing custom rows in a all/none toggle", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    addCustomOption(q, "custom");
    q.handleInput("a");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("● A"))).toBe(true);
    expect(lines.some((l) => l.includes("● B"))).toBe(true);
    expect(lines.some((l) => l.includes("● custom (custom)"))).toBe(true);

    q.handleInput("a");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: [] },
      ],
      cancelled: false,
    });
  });

  it("ignores a in single-select", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("a");
    expect(done).not.toHaveBeenCalled();

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("> 1. Red"))).toBe(true);
  });

  it("renders the inline editor after selecting Type something", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Your answer:"))).toBe(true);
    const typeSomethingRow = lines.find((l) => l.includes("Type something."));
    expect(typeSomethingRow).toBeDefined();
    expect(typeSomethingRow!.includes("✎")).toBe(false);
  });

  it("truncates preview lines that exceed available width", () => {
    const params = makeParams([
      {
        question: "Which layout?",
        header: "Layout",
        options: [
          { label: "Vertical", description: "Top/bottom", preview: "a".repeat(100) },
          { label: "Side", description: "Left/right" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());
    const lines = q.render(20);
    expect(lines.some((l) => l.includes("Preview:"))).toBe(true);
  });

  it("highlights the chat row when focused", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("down");
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("> 4. Chat about this"))).toBe(true);
  });

  it("toggles a multi-select option off again", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("space");
    q.handleInput("space");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: [] },
      ],
      cancelled: false,
    });
  });

  it("does not toggle when space is pressed on a sentinel row in multi-select", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    // Move focus to the chat row
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("space");
    q.handleInput("enter");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "chat", answer: "Chat about this" },
      ],
      cancelled: false,
    });
  });

  it("does nothing when space is pressed in single-select", () => {
    const params = makeParams([
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("space");
    expect(done).not.toHaveBeenCalled();
  });

  it("cancels from the Submit tab on escape", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
      {
        question: "Q2?",
        header: "Q2",
        options: [
          { label: "A2", description: "a2" },
          { label: "B2", description: "b2" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("enter");
    q.handleInput("enter");
    q.handleInput("escape");

    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Q1?", kind: "option", answer: "A1" },
        { questionIndex: 1, question: "Q2?", kind: "option", answer: "A2" },
      ],
      cancelled: true,
    });
  });

  it("renders the Submit tab with each answer kind", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
      {
        question: "Which color?",
        header: "Color",
        options: [
          { label: "Red", description: "Warm" },
          { label: "Blue", description: "Cool" },
        ],
      },
      {
        question: "Talk?",
        header: "Talk",
        options: [
          { label: "Yes", description: "y" },
          { label: "No", description: "n" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    // Q1: multi-select A
    q.handleInput("space");
    q.handleInput("enter");

    // Q2: custom input
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");
    q.handleInput("p");
    q.handleInput("i");
    q.handleInput("n");
    q.handleInput("k");
    q.handleInput("enter");
    // the new custom row is focused; press Enter again to submit it
    q.handleInput("enter");

    // Q3: chat
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Ready to submit"))).toBe(true);
    expect(lines.some((l) => l.includes("Features: A"))).toBe(true);
    expect(lines.some((l) => l.includes("Color: pink"))).toBe(true);
    expect(lines.some((l) => l.includes("Talk: Chat about this"))).toBe(true);
    expect(lines.some((l) => l.includes("Press Enter to submit"))).toBe(true);

    q.handleInput("enter");
    expect(done).toHaveBeenCalledWith({
      answers: [
        { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: ["A"] },
        { questionIndex: 1, question: "Which color?", kind: "custom", answer: "pink" },
        { questionIndex: 2, question: "Talk?", kind: "chat", answer: "Chat about this" },
      ],
      cancelled: false,
    });
  });

  it("renders a checked multi-select box", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("space");
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("● A"))).toBe(true);
  });

  it("renders empty multi-select and custom answers on the Submit tab", () => {
    const params = makeParams([
      {
        question: "Which features?",
        header: "Features",
        multiSelect: true,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      },
      {
        question: "Any notes?",
        header: "Notes",
        options: [
          { label: "Yes", description: "y" },
          { label: "No", description: "n" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    // Q1: submit multi-select with nothing selected
    q.handleInput("enter");

    // Q2: choose Type something and submit empty text
    q.handleInput("down");
    q.handleInput("down");
    q.handleInput("enter");
    q.handleInput("enter");

    // navigate to the Submit tab to see the unanswered summary
    q.handleInput("tab");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Features: (no input)"))).toBe(true);
    expect(lines.some((l) => l.includes("Notes: (no input)"))).toBe(true);
  });

  it("renders an option answer with an empty label on the Submit tab", () => {
    const params = makeParams([
      {
        question: "Empty?",
        header: "Empty",
        options: [
          { label: "", description: "empty label" },
          { label: "B", description: "b" },
        ],
      },
      {
        question: "Confirm?",
        header: "Confirm",
        options: [
          { label: "Yes", description: "y" },
          { label: "No", description: "n" },
        ],
      },
    ]);
    const done = vi.fn();
    const q = createQuestionnaire(params, mockTui, mockTheme, done);

    q.handleInput("enter");
    q.handleInput("enter");

    const lines = q.render(80);
    expect(lines.some((l) => l.includes("Empty: (no input)"))).toBe(true);
  });

  it("uses success styling for the Submit tab when all questions are answered", () => {
    const params = makeParams([
      {
        question: "Q1?",
        header: "Q1",
        options: [
          { label: "A1", description: "a1" },
          { label: "B1", description: "b1" },
        ],
      },
      {
        question: "Q2?",
        header: "Q2",
        options: [
          { label: "A2", description: "a2" },
          { label: "B2", description: "b2" },
        ],
      },
    ]);
    const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

    q.handleInput("enter");
    q.handleInput("enter");
    q.handleInput("left");
    q.handleInput("left");
    const lines = q.render(80);
    expect(lines.some((l) => l.includes("■ Q1"))).toBe(true);
    expect(lines.some((l) => l.includes("■ Q2"))).toBe(true);
    expect(lines.some((l) => l.includes("✓ Submit"))).toBe(true);
  });
});
